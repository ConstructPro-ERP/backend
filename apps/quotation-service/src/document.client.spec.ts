import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { DocumentClient } from './document.client';

const mockHttpService = {
  post: jest.fn(),
};

describe('DocumentClient', () => {
  let client: DocumentClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentClient,
        { provide: HttpService, useValue: mockHttpService },
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

  it('returns null and does not throw when the document service fails', async () => {
    mockHttpService.post.mockReturnValue(
      throwError(() => new Error('service unavailable')),
    );

    const result = await client.generatePdf('quot-1');

    expect(result).toBeNull();
  });

  it('returns null when response has no pdfUrl field', async () => {
    mockHttpService.post.mockReturnValue(of({ data: {} }));

    const result = await client.generatePdf('quot-1');

    expect(result).toBeNull();
  });
});
