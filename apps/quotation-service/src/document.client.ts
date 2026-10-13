import { Injectable, Logger, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Prisma } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { CloudinaryService } from '../../../libs/common/src/cloudinary/cloudinary.service';
import { PrismaService } from '../../../prisma/prisma.service';

// Quotation data required to generate a PDF.
// Derived from the Prisma schema to keep relation and field types synchronized with the database model.
type QuotationPdfData = Prisma.QuotationGetPayload<{
  include: {
    items: true;
    lead: {
      select: {
        customerName: true;
        email: true;
        phone: true;
      };
    };
  };
}>;

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
          { timeout: 10000 },
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

function buildQuotationPdf(quotation: QuotationPdfData): Buffer {
  const lines: string[] = [
    'ConstructPro ERP — Official Quotation',
    '======================================',
    '',
    `Quotation ID: ${quotation.id}`,
    `Status: ${quotation.status}`,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    'Validity: Valid for 30 days from generation',
    '',
    'Client Information:',
    `Customer Name: ${quotation.lead?.customerName ?? 'N/A'}`,
    `Email: ${quotation.lead?.email ?? 'N/A'}`,
    `Phone: ${quotation.lead?.phone ?? 'N/A'}`,
    '',
    'Line Items:',
    '--------------------------------------',
  ];

  let subtotal = new Prisma.Decimal(0);
  if (quotation.items && Array.isArray(quotation.items)) {
    for (const item of quotation.items) {
      const unitPrice = Number(item.unitPrice);
      const itemTotal = Number(item.amount ?? item.quantity * unitPrice);
      subtotal = subtotal.plus(itemTotal);
      lines.push(
        `- ${item.itemName}: ${item.quantity} x $${unitPrice.toFixed(2)} = $${itemTotal.toFixed(2)}`,
      );
    }
  }

  lines.push('--------------------------------------');
  lines.push(`Subtotal: $${subtotal.toFixed(2)}`);
  lines.push(`Total Amount: $${Number(quotation.totalAmount).toFixed(2)}`);

  if (quotation.notes) {
    lines.push('');
    lines.push('Notes & Special Conditions:');
    const noteLines = String(quotation.notes).split('\n');
    for (const nLine of noteLines) {
      lines.push(`  ${nLine}`);
    }
  }

  lines.push('');
  lines.push(
    'Terms: Payment terms as agreed. Subject to standard ConstructPro terms.',
  );

  // Wrap long fields and paginate so large quotations do not run off the page.
  const wrapped = lines.flatMap((line) => {
    const clean = line.replace(/[\r\n\t]/g, ' ');
    return clean.match(/.{1,80}/g) ?? [''];
  });
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += 50) {
    pages.push(wrapped.slice(i, i + 50));
  }
  const pageIds = pages.map((_, index) => 4 + index * 2);
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    `2 0 obj << /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >> endobj`,
    '3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];
  pages.forEach((pageLines, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const content = [
      'BT',
      '/F1 10 Tf',
      '50 750 Td',
      '14 TL',
      ...pageLines.map(
        (line, lineIndex) =>
          `${lineIndex === 0 ? '' : 'T* '}(${escapePdfText(line)}) Tj`,
      ),
      'ET',
    ].join('\n');
    objects.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >> endobj`,
      `${contentId} 0 obj << /Length ${Buffer.byteLength(content, 'utf8')} >> stream\n${content}\nendstream endobj`,
    );
  });

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
