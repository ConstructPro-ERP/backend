import { Injectable, Logger, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CloudinaryService } from '../../../libs/common/src/cloudinary/cloudinary.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class DocumentClient {
  private readonly logger = new Logger(DocumentClient.name);
  private readonly baseUrl =
    process.env.DOCUMENT_SERVICE_URL ?? 'http://localhost:3010';

  constructor(
    private readonly httpService: HttpService,
    @Optional() private readonly cloudinaryService?: CloudinaryService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async generatePdf(quotationId: string): Promise<string | null> {
    // 1. Attempt generation via external Document Service if reachable
    try {
      const resp = await firstValueFrom(
        this.httpService.post<{ pdfUrl: string }>(
          `${this.baseUrl}/documents/quotation-pdf`,
          { quotationId },
        ),
      );
      if (resp.data?.pdfUrl) {
        return resp.data.pdfUrl;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Document service unavailable or failed for quotation ${quotationId}: ${msg}`,
      );
    }

    // 2. Direct Fallback: Generate quotation PDF and upload to Cloudinary
    if (this.cloudinaryService && this.prisma) {
      try {
        const quotation = await this.prisma.quotation.findUnique({
          where: { id: quotationId },
          include: {
            items: true,
            lead: {
              select: { customerName: true, email: true, phone: true },
            },
          },
        });

        if (quotation) {
          const pdfBuffer = buildQuotationPdf(quotation);
          const pdfUrl = await this.cloudinaryService.uploadBuffer(
            pdfBuffer,
            'quotations',
            `quotation-${quotation.id}`,
            'raw',
          );
          this.logger.log(
            `Quotation ${quotationId} PDF uploaded to Cloudinary: ${pdfUrl}`,
          );
          return pdfUrl;
        }
      } catch (uploadErr: unknown) {
        const errMsg =
          uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        this.logger.error(
          `Cloudinary upload failed for quotation ${quotationId}: ${errMsg}`,
        );
      }
    }

    return null;
  }
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildQuotationPdf(quotation: any): Buffer {
  const lines: string[] = [
    'ConstructPro ERP — Official Quotation',
    '======================================',
    '',
    `Quotation ID: ${quotation.id}`,
    `Status: ${quotation.status}`,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    `Customer: ${quotation.lead?.customerName ?? 'N/A'}`,
    `Email: ${quotation.lead?.email ?? 'N/A'}`,
    `Phone: ${quotation.lead?.phone ?? 'N/A'}`,
    '',
    'Line Items:',
    '--------------------------------------',
  ];

  if (quotation.items && Array.isArray(quotation.items)) {
    for (const item of quotation.items) {
      const itemTotal = Number(
        item.amount ?? item.quantity * item.unitPrice,
      ).toFixed(2);
      lines.push(
        `- ${item.itemName}: ${item.quantity} x $${Number(item.unitPrice).toFixed(2)} = $${itemTotal}`,
      );
    }
  }

  lines.push('');
  lines.push(`Total Amount: $${Number(quotation.totalAmount).toFixed(2)}`);
  if (quotation.notes) {
    lines.push('');
    lines.push(`Notes: ${quotation.notes}`);
  }

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
