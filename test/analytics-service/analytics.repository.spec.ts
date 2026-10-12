import { LeadStatus } from '@prisma/client';
import { AnalyticsRepository } from '../../apps/analytics-service/src/repositories/analytics.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { createPrismaMock, objectContaining } from '../support/prisma.mock';

describe('AnalyticsRepository reports', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let repository: AnalyticsRepository;
  beforeEach(() => {
    prisma = createPrismaMock();
    repository = new AnalyticsRepository(prisma as unknown as PrismaService);
  });

  it('retains filters and aggregation fields for dashboard KPIs', async () => {
    const where = { createdAt: { gte: new Date('2026-10-01') } };
    await repository.aggregateInvoices(where);
    await repository.countProjects(where);
    await repository.groupInvoiceStatuses(where);
    await repository.countLeads(where);
    await repository.countConvertedLeads(where);
    await repository.groupQuotationStatuses(where);
    expect(prisma.invoice.aggregate).toHaveBeenCalledWith({
      where,
      _sum: { totalAmount: true, paidAmount: true, outstandingAmount: true },
    });
    expect(prisma.project.count).toHaveBeenCalledWith({ where });
    expect(prisma.invoice.groupBy).toHaveBeenCalledWith({
      where,
      by: ['status'],
      _count: { _all: true },
    });
    expect(prisma.lead.count).toHaveBeenNthCalledWith(1, { where });
    expect(prisma.lead.count).toHaveBeenNthCalledWith(2, {
      where: { ...where, status: LeadStatus.CONVERTED },
    });
    expect(prisma.quotation.groupBy).toHaveBeenCalledWith({
      where,
      by: ['status'],
      _count: { _all: true },
    });
  });

  it('limits recent activity and orders each source consistently while loading related labels', async () => {
    const where = { createdAt: { gte: new Date('2026-10-01') } };
    await repository.findRecentInvoices(where, 7);
    await repository.findRecentPayments(where, 7);
    await repository.findRecentProjects(where, 7);
    await repository.findRecentLeads(where, 7);
    await repository.findRecentQuotations(where, 7);
    await repository.findRecentDocuments(where, 7);
    await repository.findRecentMilestones(where, 7);
    for (const model of [
      prisma.invoice,
      prisma.payment,
      prisma.project,
      prisma.lead,
      prisma.quotation,
      prisma.document,
      prisma.milestone,
    ]) {
      expect(model.findMany).toHaveBeenCalledWith(
        objectContaining({
          where,
          take: 7,
          orderBy: { createdAt: 'desc' },
        }),
      );
    }
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      objectContaining({
        include: objectContaining({
          category: { select: { categoryName: true } },
          project: expect.any(Object) as unknown,
        }),
      }),
    );
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      objectContaining({
        include: {
          invoice: {
            select: {
              id: true,
              project: { select: { id: true, projectName: true } },
            },
          },
        },
      }),
    );
  });

  it('loads milestone tasks for progress reports and matches the count filter', async () => {
    const where = { projectManagerId: 'manager1' };
    const args = {
      where,
      skip: 5,
      take: 5,
      orderBy: { createdAt: 'asc' as const },
    };
    await repository.findProjectsForCompletionReport(args);
    await repository.countProjectsForReport(where);
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      ...args,
      include: {
        milestones: {
          include: { tasks: { select: { id: true, status: true } } },
        },
      },
    });
    expect(prisma.project.count).toHaveBeenCalledWith({ where });
  });

  it('groups expenses by project with matching totals and resolves project names in one lookup', async () => {
    const where = { projectId: 'p1' };
    await repository.aggregateExpenses(where);
    await repository.groupExpensesByProject(where);
    await repository.findProjectsByIds(['p1', 'p2']);
    expect(prisma.expense.aggregate).toHaveBeenCalledWith({
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
    expect(prisma.expense.groupBy).toHaveBeenCalledWith({
      where,
      by: ['projectId'],
      _sum: { amount: true },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2'] } },
      select: { id: true, projectName: true },
    });
  });

  it('keeps overdue report filters, pagination and joined customer/project labels', async () => {
    const where = { projectId: 'p1', outstandingAmount: { gt: 0 } };
    const args = {
      where,
      skip: 0,
      take: 20,
      orderBy: { dueDate: 'asc' as const },
    };
    await repository.findOverdueInvoices(args);
    await repository.countOverdueInvoices(where);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      objectContaining({
        ...args,
        include: {
          customer: { select: { id: true, fullName: true } },
          project: { select: { id: true, projectName: true } },
        },
      }),
    );
    expect(prisma.invoice.count).toHaveBeenCalledWith({ where });
  });
});
