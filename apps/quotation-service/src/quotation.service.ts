import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentClient } from './document.client';
import { ProjectClient } from './project.client';
import { NotificationClient } from './notification.client';
import { CreateQuotationDto } from './dto/create-quotation.dto';

@Injectable()
export class QuotationService {
  private readonly logger = new Logger(QuotationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentClient: DocumentClient,
    private readonly projectClient: ProjectClient,
    private readonly notificationClient: NotificationClient,
  ) {}

  async create(dto: CreateQuotationDto) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: dto.leadId },
    });
    if (!lead) {
      throw new NotFoundException({
        code: 'LEAD_NOT_FOUND',
        message: 'Lead not found.',
      });
    }

    const itemsWithAmounts = dto.items.map((item) => {
      const amount = round2(item.quantity * item.unitPrice);
      return { ...item, amount };
    });

    const totalAmount = round2(
      itemsWithAmounts.reduce((sum, i) => sum + i.amount, 0),
    );

    const quotation = await this.prisma.$transaction(async (tx) => {
      return tx.quotation.create({
        data: {
          leadId: dto.leadId,
          totalAmount: totalAmount,
          notes: dto.notes,
          items: {
            create: itemsWithAmounts.map((i) => ({
              itemName: i.itemName,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              amount: i.amount,
            })),
          },
        },
        include: { items: true },
      });
    });

    const pdfUrl = await this.documentClient.generatePdf(quotation.id);
    if (pdfUrl) {
      await this.prisma.quotation.update({
        where: { id: quotation.id },
        data: { pdfUrl },
      });
      return { ...quotation, pdfUrl };
    }

    return quotation;
  }

  async findOne(id: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!quotation) {
      throw new NotFoundException({
        code: 'QUOTATION_NOT_FOUND',
        message: 'Quotation not found.',
      });
    }
    return quotation;
  }

  async approveAndConvert(id: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!quotation) {
      throw new NotFoundException({
        code: 'QUOTATION_NOT_FOUND',
        message: 'Quotation not found.',
      });
    }

    // BR 10.2 + idempotency — check BEFORE any writes or external calls
    if (quotation.status === 'CONVERTED' || quotation.projectId !== null) {
      throw new ConflictException({
        code: 'ALREADY_CONVERTED',
        message: 'Quotation has already been converted to a project.',
      });
    }

    if (quotation.status === 'REJECTED') {
      throw new BadRequestException({
        code: 'QUOTATION_REJECTED',
        message: 'A rejected quotation cannot be converted.',
      });
    }

    // Mark APPROVED
    await this.prisma.quotation.update({
      where: { id },
      data: { status: 'APPROVED' },
    });

    // Call project service — throws BadGatewayException on failure (safe to retry)
    const { projectId } = await this.projectClient.createFromQuotation(
      id,
      quotation.leadId,
      Number(quotation.totalAmount),
    );

    // Only mark CONVERTED after the project service confirmed success
    const converted = await this.prisma.quotation.update({
      where: { id },
      data: { status: 'CONVERTED', projectId },
      include: { items: true },
    });

    // Best-effort notification — failure must not fail the conversion
    try {
      await this.notificationClient.notifyProjectCreated(id, projectId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Notification error after converting quotation ${id}: ${msg}`,
      );
    }

    return { quotation: converted, projectId };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
