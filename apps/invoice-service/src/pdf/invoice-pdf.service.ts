import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CloudinaryService } from '../../../../libs/common/src/cloudinary/cloudinary.service';

interface InvoicePdfData {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  status: string;
  customerName: string;
  customerId: string;
  projectName: string;
  projectId: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  notes: string | null;
}

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(
    @Optional() private readonly cloudinaryService?: CloudinaryService,
  ) {}

  async generate(data: InvoicePdfData) {
    const fileName = `${sanitize(data.invoiceNumber)}.pdf`;
    const pdfBuffer = buildPdf(data);

    if (this.cloudinaryService && hasCloudinaryCredentials()) {
      try {
        return await this.storeInvoicePdfInCloudinary(fileName, pdfBuffer);
      } catch (error) {
        this.logger.error(
          `Could not store generated invoice PDF ${fileName}.`,
          error instanceof Error ? error.stack : undefined,
        );
        throw new ServiceUnavailableException({
          code: 'INVOICE_PDF_STORAGE_UNAVAILABLE',
          message:
            'Invoice PDF storage is unavailable. Check the Cloudinary configuration and try again.',
        });
      }
    }

    if (isProductionRuntime()) {
      throw new ServiceUnavailableException({
        code: 'INVOICE_PDF_STORAGE_NOT_CONFIGURED',
        message:
          'Invoice PDF storage is not configured. Add the Cloudinary credentials to the invoice service.',
      });
    }

    return this.storeInvoicePdfLocally(fileName, pdfBuffer);
  }

  private async storeInvoicePdfLocally(fileName: string, pdfBuffer: Buffer) {
    const directory = resolve(process.cwd(), 'storage', 'invoices');
    const filePath = join(directory, fileName);
    const publicBaseUrl =
      process.env.INVOICE_PDF_BASE_URL ??
      'http://localhost:4010/files/invoices';

    await mkdir(directory, { recursive: true });
    await writeFile(filePath, pdfBuffer, 'binary');

    return {
      filePath,
      publicUrl: `${publicBaseUrl}/${fileName}`,
      generatedAt: new Date(),
      directory,
      fileName,
    };
  }

  private async storeInvoicePdfInCloudinary(
    fileName: string,
    pdfBuffer: Buffer,
  ) {
    const publicUrl = await this.cloudinaryService!.uploadBuffer(
      pdfBuffer,
      'invoices',
      fileName,
      'raw',
    );

    return {
      filePath: `constructpro/invoices/${fileName}`,
      publicUrl,
      generatedAt: new Date(),
      directory: 'cloudinary:constructpro/invoices',
      fileName,
    };
  }
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-');
}

function hasCloudinaryCredentials(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  );
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function money(value: number): string {
  return value.toFixed(2);
}

function date(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : 'N/A';
}

function buildPdf(data: InvoicePdfData): Buffer {
  const lines = [
    'ConstructPro Invoice',
    '',
    `Invoice Number: ${data.invoiceNumber}`,
    `Invoice ID: ${data.invoiceId}`,
    `Invoice Date: ${date(data.invoiceDate)}`,
    `Due Date: ${date(data.dueDate)}`,
    `Status: ${data.status}`,
    '',
    `Customer: ${data.customerName}`,
    `Customer ID: ${data.customerId}`,
    `Project: ${data.projectName}`,
    `Project ID: ${data.projectId}`,
    '',
    `Total Amount: ${money(data.totalAmount)}`,
    `Paid Amount: ${money(data.paidAmount)}`,
    `Outstanding Amount: ${money(data.outstandingAmount)}`,
    '',
    `Notes: ${data.notes?.trim() || 'N/A'}`,
  ];

  const content = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    '14 TL',
    ...lines.map((line, index) =>
      index === 0
        ? `(${escapePdfText(line)}) Tj`
        : `T* (${escapePdfText(line)}) Tj`,
    ),
    'ET',
  ].join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(content, 'utf8')} >> stream\n${content}\nendstream endobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}
