import { Logger } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudinaryService } from '../../libs/common/src/cloudinary/cloudinary.service';
import { InvoicePdfService } from '../../apps/invoice-service/src/pdf/invoice-pdf.service';

describe('InvoicePdfService', () => {
  const uploadBuffer = jest.fn();
  const service = new InvoicePdfService({
    uploadBuffer,
  } as unknown as CloudinaryService);
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
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    delete process.env.VERCEL;
    process.env.NODE_ENV = 'test';
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

  function configureCloudinary() {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
  }

  it('uploads generated PDF bytes to Cloudinary when configured', async () => {
    configureCloudinary();
    uploadBuffer.mockResolvedValue('https://files.test/invoice.pdf');
    const result = await service.generate(data);
    expect(uploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'invoices',
      'INV-202610-0001.pdf',
      'raw',
    );
    const [uploadedPdf] = uploadBuffer.mock.calls[0] as [Buffer];
    expect(uploadedPdf.toString()).toContain('%PDF-1.4');
    expect(result.publicUrl).toBe('https://files.test/invoice.pdf');
    expect(result.filePath).toBe('constructpro/invoices/INV-202610-0001.pdf');
    expect(result.directory).toBe('cloudinary:constructpro/invoices');
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it.each([new Error('storage unavailable'), 'upload rejected'])(
    'returns an actionable storage failure without falling back to disk: %s',
    async (error) => {
      configureCloudinary();

      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      uploadBuffer.mockRejectedValue(error);

      await expect(service.generate(data)).rejects.toMatchObject({
        status: 503,
        response: { code: 'INVOICE_PDF_STORAGE_UNAVAILABLE' },
      });

      await expect(
        readFile(join(directory, 'storage/invoices/INV-202610-0001.pdf')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it.each([
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ])('rejects production PDF generation when %s is missing', async (key) => {
    configureCloudinary();
    delete process.env[key];
    process.env.NODE_ENV = 'production';
    await expect(service.generate(data)).rejects.toMatchObject({
      status: 503,
      response: { code: 'INVOICE_PDF_STORAGE_NOT_CONFIGURED' },
    });
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  it('rejects disk fallback on Vercel even when NODE_ENV is not production', async () => {
    process.env.VERCEL = '1';
    await expect(service.generate(data)).rejects.toMatchObject({ status: 503 });
  });

  it('allows development disk storage without an injected Cloudinary service', async () => {
    configureCloudinary();
    const result = await new InvoicePdfService().generate({
      ...data,
      notes: '   ',
    });
    expect(await readFile(result.filePath, 'utf8')).toContain('Notes: N/A');
    expect(uploadBuffer).not.toHaveBeenCalled();
  });
});
