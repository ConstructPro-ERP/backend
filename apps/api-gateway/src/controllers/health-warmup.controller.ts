import { HttpService } from '@nestjs/axios';
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const WARMUP_COOLDOWN_MS = 5 * 60 * 1000;
const SERVICE_URLS = [
  () => process.env.AUTH_SERVICE_URL ?? 'http://localhost:3333',
  () => process.env.USER_SERVICE_URL ?? 'http://localhost:3334',
  () => process.env.QUOTATION_SERVICE_URL ?? 'http://localhost:4009',
  () => process.env.INVOICE_SERVICE_URL ?? 'http://localhost:4010',
  () => process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3005',
  () => process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:4011',
  () => process.env.AI_SERVICE_URL ?? 'http://localhost:4012',
  () => process.env.PROJECT_SERVICE_URL ?? 'http://localhost:3003',
  () => process.env.TASK_SERVICE_URL ?? 'http://localhost:3004',
  () => process.env.DOCUMENT_SERVICE_URL ?? 'http://localhost:3006',
  () => process.env.CALENDAR_SERVICE_URL ?? 'http://localhost:4013',
  () => process.env.LEAD_SERVICE_URL ?? 'http://localhost:4020',
  () => process.env.CLIENT_SERVICE_URL ?? 'http://localhost:4021',
];

@Controller('health')
export class HealthWarmupController {
  private lastStartedAt = 0;
  private warmupInFlight: Promise<void> | null = null;

  constructor(private readonly httpService: HttpService) {}

  @Get('warmup')
  @HttpCode(HttpStatus.ACCEPTED)
  async warmup(): Promise<{ accepted: true }> {
    if (this.warmupInFlight) {
      await this.warmupInFlight;
      return { accepted: true };
    }

    if (Date.now() - this.lastStartedAt < WARMUP_COOLDOWN_MS) {
      return { accepted: true };
    }

    this.lastStartedAt = Date.now();
    this.warmupInFlight = Promise.allSettled(
      SERVICE_URLS.map((getBaseUrl) =>
        firstValueFrom(
          this.httpService.get(`${getBaseUrl().replace(/\/+$/, '')}/`, {
            timeout: 5000,
            validateStatus: () => true,
          }),
        ),
      ),
    ).then(() => undefined);

    try {
      await this.warmupInFlight;
    } finally {
      this.warmupInFlight = null;
    }

    return { accepted: true };
  }
}
