import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const invoiceInclude = Prisma.validator<Prisma.InvoiceInclude>()({
  project: {
    select: {
      id: true,
      projectName: true,
      location: true,
      status: true,
    },
  },
  customer: {
    select: {
      id: true,
      fullName: true,
    },
  },
  payments: {
    select: {
      id: true,
      amount: true,
      paymentDate: true,
    },
  },
});

export type InvoiceWithDetails = Prisma.InvoiceGetPayload<{
  include: typeof invoiceInclude;
}>;

@Injectable()
export class InvoiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProjectWithCustomer(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        quotation: {
          include: {
            lead: {
              include: { customer: true },
            },
          },
        },
      },
    });
  }

  findCustomer(customerId: string) {
    return this.prisma.customer.findUnique({ where: { id: customerId } });
  }

  create(data: {
    projectId: string;
    customerId: string;
    invoiceNumber?: string;
    invoiceDate: Date;
    dueDate?: Date;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    pdfPath?: string;
    pdfUrl?: string;
    pdfGeneratedAt?: Date;
    notes?: string;
    status: InvoiceStatus;
    createdBy?: string;
    updatedBy?: string;
  }) {
    return this.prisma.invoice.create({ data, include: invoiceInclude });
  }

  async findManyAndCount(args: {
    where: Prisma.InvoiceWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.InvoiceOrderByWithRelationInput;
  }): Promise<[InvoiceWithDetails[], number]> {
    return this.prisma.$transaction([
      this.prisma.invoice.findMany({
        ...args,
        include: invoiceInclude,
      }),
      this.prisma.invoice.count({ where: args.where }),
    ]);
  }

  findById(id: string) {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: invoiceInclude,
    });
  }

  update(
    id: string,
    data: {
      projectId?: string;
      customerId?: string;
      invoiceNumber?: string;
      invoiceDate?: Date;
      dueDate?: Date;
      totalAmount?: number;
      outstandingAmount?: number;
      pdfPath?: string;
      pdfUrl?: string;
      pdfGeneratedAt?: Date;
      notes?: string;
      status?: InvoiceStatus;
      updatedBy?: string;
    },
  ) {
    return this.prisma.invoice.update({
      where: { id },
      data,
      include: invoiceInclude,
    });
  }

  countByInvoiceNumberPrefix(prefix: string) {
    return this.prisma.invoice.count({
      where: {
        invoiceNumber: {
          startsWith: prefix,
        },
      },
    });
  }
}
