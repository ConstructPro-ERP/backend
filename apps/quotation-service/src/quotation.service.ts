import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  BadGatewayException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentClient } from './document.client';
import { ProjectClient } from './project.client';
import { NotificationClient } from './notification.client';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { ApproveQuotationDto } from './dto/approve-quotation.dto';
import { GetQuotationsQueryDto } from './dto/get-quotations-query.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';

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

  async findAll(query?: GetQuotationsQueryDto) {
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.max(1, Math.min(100, query?.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.QuotationWhereInput = {
      ...(query?.leadId ? { leadId: query.leadId } : {}),
      ...(query?.status ? { status: query.status } : {}),
      ...(query?.search
        ? {
            OR: [
              {
                lead: {
                  customerName: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                notes: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.quotation.count({ where }),
      this.prisma.quotation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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

  async update(id: string, dto: UpdateQuotationDto) {
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

    if (quotation.status === 'CONVERTED' || quotation.status === 'APPROVED') {
      throw new BadRequestException({
        code: 'QUOTATION_LOCKED',
        message: 'Approved or converted quotations cannot be edited.',
      });
    }

    if (dto.items && dto.items.length > 0) {
      const itemsWithAmounts = dto.items.map((item) => {
        const amount = round2(item.quantity * item.unitPrice);
        return { ...item, amount };
      });

      const totalAmount = round2(
        itemsWithAmounts.reduce((sum, i) => sum + i.amount, 0),
      );

      return this.prisma.$transaction(async (tx) => {
        await tx.quotationItem.deleteMany({
          where: { quotationId: id },
        });

        return tx.quotation.update({
          where: { id },
          data: {
            notes: dto.notes !== undefined ? dto.notes : quotation.notes,
            totalAmount,
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
    }

    if (dto.notes !== undefined) {
      return this.prisma.quotation.update({
        where: { id },
        data: { notes: dto.notes },
        include: { items: true },
      });
    }

    return quotation;
  }

  async approveAndConvert(id: string, dto: ApproveQuotationDto) {
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

    if (quotation.status === 'CONVERTED') {
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

    if (
      quotation.projectId &&
      dto.targetProjectId &&
      quotation.projectId !== dto.targetProjectId
    ) {
      throw new ConflictException({
        code: 'QUOTATION_PROJECT_MISMATCH',
        message: 'Quotation is already linked to a different project.',
      });
    }

    const targetProjectId = quotation.projectId ?? dto.targetProjectId;

    if (
      !targetProjectId &&
      (!dto.projectName || !dto.startDate || !dto.projectManagerId)
    ) {
      throw new BadRequestException({
        code: 'PROJECT_DETAILS_REQUIRED',
        message:
          'projectName, startDate, and projectManagerId are required when creating a new project.',
      });
    }

    if (quotation.status !== 'APPROVED') {
      await this.prisma.quotation.update({
        where: { id },
        data: { status: 'APPROVED' },
      });
    }

    const projectResult = targetProjectId
      ? await this.projectClient.createFromQuotation({
          quotationId: id,
          leadId: quotation.leadId,
          targetProjectId,
        })
      : await this.projectClient.createFromQuotation({
          quotationId: id,
          leadId: quotation.leadId,
          projectName: dto.projectName,
          location: dto.location,
          startDate: dto.startDate,
          endDate: dto.endDate,
          projectManagerId: dto.projectManagerId,
          budget: dto.budget,
        });

    const converted = await this.prisma.quotation.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        projectId: projectResult.projectId,
      },
      include: { items: true },
    });

    try {
      await this.notificationClient.notifyProjectCreated(
        id,
        projectResult.projectId,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      this.logger.warn(
        `Notification error after converting quotation ${id}: ${msg}`,
      );
    }

    return {
      quotation: converted,
      projectId: projectResult.projectId,
      projectStatus: projectResult.status,
    };
  }

  async reject(id: string, reason: string) {
    const quotation = await this.findOne(id);

    if (quotation.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot reject quotation with status ${quotation.status}. Only PENDING_APPROVAL quotations can be rejected.`,
      });
    }

    const notes = quotation.notes
      ? `${quotation.notes}\n[Rejection Reason]: ${reason}`
      : `[Rejection Reason]: ${reason}`;

    return this.prisma.quotation.update({
      where: { id },
      data: {
        status: 'REJECTED',
        notes,
      },
      include: { items: true },
    });
  }

  async revise(id: string) {
    const quotation = await this.findOne(id);

    if (quotation.status !== 'REJECTED') {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot revise quotation with status ${quotation.status}. Only REJECTED quotations can be moved to revision.`,
      });
    }

    return this.prisma.quotation.update({
      where: { id },
      data: {
        status: 'DRAFT',
      },
      include: { items: true },
    });
  }

  async getPdf(id: string) {
    const quotation = await this.findOne(id);

    if (quotation.pdfUrl) {
      return { pdfUrl: quotation.pdfUrl };
    }

    const pdfUrl = await this.documentClient.generatePdf(id);
    if (!pdfUrl) {
      throw new BadGatewayException({
        code: 'PDF_GENERATION_FAILED',
        message:
          'Quotation PDF generation failed or document service is unavailable.',
      });
    }

    await this.prisma.quotation.update({
      where: { id },
      data: { pdfUrl },
    });

    return { pdfUrl };
  }
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
