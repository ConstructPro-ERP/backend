import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class DocumentClient {
  private readonly logger = new Logger(DocumentClient.name);
  private readonly baseUrl =
    process.env.DOCUMENT_SERVICE_URL ?? 'http://localhost:3010';

  constructor(private readonly httpService: HttpService) {}

  async generatePdf(quotationId: string): Promise<string | null> {
    try {
      const resp = await firstValueFrom(
        this.httpService.post<{ pdfUrl: string }>(
          `${this.baseUrl}/documents/quotation-pdf`,
          { quotationId },
        ),
      );
      return resp.data?.pdfUrl ?? null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `PDF generation failed for quotation ${quotationId}: ${msg}`,
      );
      return null;
    }
  }
}
