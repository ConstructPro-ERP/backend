import { Injectable } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  aggregateInvoices(where: Prisma.InvoiceWhereInput) {
    return this.prisma.invoice.aggregate({
      where,
      _sum: {
        totalAmount: true,
        paidAmount: true,
        outstandingAmount: true,
      },
    });
  }

  countProjects(where: Prisma.ProjectWhereInput) {
    return this.prisma.project.count({ where });
  }

  groupInvoiceStatuses(where: Prisma.InvoiceWhereInput) {
    return this.prisma.invoice.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
  }

  countLeads(where: Prisma.LeadWhereInput) {
    return this.prisma.lead.count({ where });
  }

  countConvertedLeads(where: Prisma.LeadWhereInput) {
    return this.prisma.lead.count({
      where: {
        ...where,
        status: LeadStatus.CONVERTED,
      },
    });
  }

  groupQuotationStatuses(where: Prisma.QuotationWhereInput) {
    return this.prisma.quotation.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
  }
}
