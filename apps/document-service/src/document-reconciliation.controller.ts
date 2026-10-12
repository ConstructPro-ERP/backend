import {
  Controller,
  Get,
  Headers,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DocumentReconciliationService } from './document-reconciliation.service';

@Controller('internal/cron/documents')
export class DocumentReconciliationController {
  constructor(private readonly reconciliation: DocumentReconciliationService) {}

  @Get('reconcile')
  async run(@Headers('authorization') authorization?: string) {
    const secret = process.env.CRON_SECRET;

    if (!secret || authorization !== `Bearer ${secret}`) {
      throw new UnauthorizedException('Invalid cron authorization.');
    }

    const result = await this.reconciliation.reconcile();

    if (result.errors > 0) {
      throw new ServiceUnavailableException(
        'Document reconciliation completed with errors.',
      );
    }

    return result;
  }
}
