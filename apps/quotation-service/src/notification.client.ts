import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class NotificationClient {
  private readonly logger = new Logger(NotificationClient.name);
  private readonly baseUrl =
    process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3011';

  constructor(private readonly httpService: HttpService) {}

  async notifyProjectCreated(
    quotationId: string,
    projectId: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/notifications/project-created`, {
          quotationId,
          projectId,
        }),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Notification failed for project ${projectId} (quotation ${quotationId}): ${msg}`,
      );
    }
  }
}
