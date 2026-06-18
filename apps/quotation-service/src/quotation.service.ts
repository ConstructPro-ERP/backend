import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentClient } from './document.client';
import { CreateQuotationDto } from './dto/create-quotation.dto';

@Injectable()
export class QuotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentClient: DocumentClient,
  ) {}

  async create(dto: CreateQuotationDto) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: dto.leadId },
    });
    if (!lead) {
      throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead not found.' });
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
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
