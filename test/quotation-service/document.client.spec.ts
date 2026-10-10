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
});
