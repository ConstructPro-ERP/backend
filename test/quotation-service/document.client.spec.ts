import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { DocumentClient } from '../../apps/quotation-service/src/document.client';
import { CloudinaryService } from '../../libs/common/src/cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockHttpService = {
  post: jest.fn(),
};

const mockCloudinaryService = {
  uploadBuffer: jest.fn(),
};

const mockPrismaService = {
  quotation: {
    findUnique: jest.fn(),
  },
};

describe('DocumentClient', () => {
  let client: DocumentClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentClient,
        { provide: HttpService, useValue: mockHttpService },
        { provide: CloudinaryService, useValue: mockCloudinaryService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();
    client = module.get<DocumentClient>(DocumentClient);
  });

  it('returns pdfUrl when the document service responds successfully', async () => {
    mockHttpService.post.mockReturnValue(
      of({ data: { pdfUrl: 'https://cdn.example.com/doc.pdf' } }),
    );

    const result = await client.generatePdf('quot-1');

    expect(result).toBe('https://cdn.example.com/doc.pdf');
    expect(mockHttpService.post).toHaveBeenCalledWith(
      expect.stringContaining('/documents/quotation-pdf'),
      { quotationId: 'quot-1' },
      { timeout: 10000 },
    );
  });

  it('falls back to Cloudinary upload when document service fails and Cloudinary is available', async () => {
    mockHttpService.post.mockReturnValue(
      throwError(() => new Error('service unavailable')),
    );
    mockPrismaService.quotation.findUnique.mockResolvedValue({
      id: 'quot-1',
      status: 'PENDING_APPROVAL',
      totalAmount: 1500,
      notes: 'Initial quotation',
      lead: { customerName: 'John Doe', email: 'john@example.com' },
      items: [
        {
          itemName: 'Foundation Pour',
          quantity: 1,
          unitPrice: 1500,
          amount: 1500,
        },
      ],
    });
    mockCloudinaryService.uploadBuffer.mockResolvedValue(
      'https://res.cloudinary.com/test/raw/upload/v1/quotation-quot-1.pdf',
    );

    const result = await client.generatePdf('quot-1');

    expect(result).toBe(
      'https://res.cloudinary.com/test/raw/upload/v1/quotation-quot-1.pdf',
    );
    expect(mockCloudinaryService.uploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'quotations',
      'quotation-quot-1',
      'raw',
    );
  });

  it('returns null and does not throw when both document service and Cloudinary upload fail', async () => {
    mockHttpService.post.mockReturnValue(
      throwError(() => new Error('service unavailable')),
    );
    mockPrismaService.quotation.findUnique.mockRejectedValue(
      new Error('database error'),
    );

    const result = await client.generatePdf('quot-1');

    expect(result).toBeNull();
  });

  it('returns null when document service returns no pdfUrl and no quotation in db', async () => {
    mockHttpService.post.mockReturnValue(of({ data: {} }));
    mockPrismaService.quotation.findUnique.mockResolvedValue(null);

    const result = await client.generatePdf('quot-1');

    expect(result).toBeNull();
  });

  it.each([0, 120])(
    'generates a valid paginated PDF for %s line items',
    async (count) => {
      mockHttpService.post.mockReturnValue(of({ data: {} }));
      mockPrismaService.quotation.findUnique.mockResolvedValue({
        id: 'quot-layout',
        status: 'DRAFT',
        totalAmount: count * 1.25,
        notes: 'Long notes '.repeat(100),
        lead: { customerName: 'Customer (test)', email: null, phone: null },
        items: Array.from({ length: count }, () => ({
          itemName: 'Long item description '.repeat(8),
          quantity: 1,
          unitPrice: 1.25,
          amount: 1.25,
        })),
      });
      mockCloudinaryService.uploadBuffer.mockImplementation(
        (buffer: Buffer) => {
          const pdf = buffer.toString('utf8');
          expect(pdf.startsWith('%PDF-1.4')).toBe(true);
          expect(pdf).toContain('Customer \\(test\\)');
          expect(pdf).toContain(`Total Amount: $${(count * 1.25).toFixed(2)}`);
          const pageCount = Number(pdf.match(/\/Count (\d+)/)?.[1]);
          expect(pageCount).toBeGreaterThanOrEqual(count === 0 ? 1 : 3);
          const xref = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
          expect(buffer.subarray(xref, xref + 4).toString()).toBe('xref');
          const offsets = [...pdf.matchAll(/(\d{10}) 00000 n/g)].map((match) =>
            Number(match[1]),
          );
          offsets.forEach((offset, index) => {
            expect(buffer.subarray(offset, offset + 20).toString()).toMatch(
              new RegExp(`^${index + 1} 0 obj`),
            );
          });
          return Promise.resolve('https://cdn.example.com/layout.pdf');
        },
      );
      await expect(client.generatePdf('quot-layout')).resolves.toBe(
        'https://cdn.example.com/layout.pdf',
      );
    },
  );
});
