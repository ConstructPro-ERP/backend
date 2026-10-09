import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { put } from '@vercel/blob';
import { InvoicePdfService } from '../../apps/invoice-service/src/pdf/invoice-pdf.service';

jest.mock('@vercel/blob', () => ({ put: jest.fn() }));

describe('InvoicePdfService', () => {
  const service = new InvoicePdfService();
  const data = {
    invoiceId: 'invoice-1',
    invoiceNumber: 'INV/202610/0001',
    invoiceDate: new Date('2026-10-01T00:00:00Z'),
    dueDate: new Date('2026-10-31T00:00:00Z'),
    status: 'PARTIALLY_PAID',
    customerName: 'Acme (Pvt) \\ Co',
    customerId: 'customer-1',
    projectName: 'Tower A',
    projectId: 'project-1',
    totalAmount: 1000.25,
    paidAmount: 250.1,
    outstandingAmount: 750.15,
    notes: 'Progress (phase 1)',
  };
  let directory: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.INVOICE_PDF_BASE_URL;
    directory = await mkdtemp(join(tmpdir(), 'finance-pdf-'));
    jest.spyOn(process, 'cwd').mockReturnValue(directory);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    process.env = originalEnv;
    await rm(directory, { recursive: true, force: true });
  });

  it('writes a PDF with balances, escaped text and valid byte offsets', async () => {
    const result = await service.generate(data);
    expect(result.fileName).toBe('INV-202610-0001.pdf');
    expect(result.publicUrl).toBe(
      'http://localhost:4010/files/invoices/INV-202610-0001.pdf',
    );
    const bytes = await readFile(result.filePath);
    const pdf = bytes.toString('utf8');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('Acme \\(Pvt\\) \\\\ Co');
    expect(pdf).toContain('Total Amount: 1000.25');
    expect(pdf).toContain('Paid Amount: 250.10');
    expect(pdf).toContain('Outstanding Amount: 750.15');
    const xref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(bytes.subarray(xref, xref + 4).toString()).toBe('xref');
    const offsets = pdf.slice(xref).split('\n').slice(3, 8);
    offsets.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(bytes.subarray(offset, offset + 7).toString()).toBe(
        `${index + 1} 0 obj`,
      );
    });
  });

  it('supports absent due dates and notes and a configured public base URL', async () => {
    process.env.INVOICE_PDF_BASE_URL = 'https://files.test/invoices';
    const result = await service.generate({
      ...data,
      dueDate: null,
      notes: null,
    });
    const pdf = await readFile(result.filePath, 'utf8');
    expect(pdf).toContain('Due Date: N/A');
    expect(pdf).toContain('Notes: N/A');
    expect(result.publicUrl).toBe(
      'https://files.test/invoices/INV-202610-0001.pdf',
    );
  });

  it('uploads generated PDF bytes to Blob when configured', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
    jest.mocked(put).mockResolvedValue({
      url: 'https://blob.test/invoice.pdf',
      pathname: 'invoices/invoice.pdf',
      contentType: 'application/pdf',
      contentDisposition: 'inline',
      downloadUrl: 'https://blob.test/invoice.pdf',
    });
    const result = await service.generate(data);
    expect(put).toHaveBeenCalledWith(
      'invoices/INV-202610-0001.pdf',
      expect.any(Buffer),
      {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'application/pdf',
      },
    );
    expect(result.publicUrl).toBe('https://blob.test/invoice.pdf');
    expect(result.directory).toBe('vercel-blob:invoices');
  });

  it('propagates upload failures without returning successful metadata', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
    jest.mocked(put).mockRejectedValue(new Error('storage unavailable'));
    await expect(service.generate(data)).rejects.toThrow('storage unavailable');
  });
});
