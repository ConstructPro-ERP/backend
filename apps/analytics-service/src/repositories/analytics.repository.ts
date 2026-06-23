import { Injectable } from '@nestjs/common';
import { AiKnowledgeSourceType, LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProjectForRagIndexing(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        milestones: {
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
        },
        expenses: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  findProjectForRiskForecast(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        milestones: {
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            milestoneName: true,
            dueDate: true,
            status: true,
            createdAt: true,
          },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            invoiceNumber: true,
            dueDate: true,
            status: true,
            totalAmount: true,
            outstandingAmount: true,
            createdAt: true,
          },
        },
        expenses: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            amount: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async findVectorKnowledgeChunks(projectId: string, limit: number) {
    const table = process.env.RAG_VECTOR_TABLE ?? 'ai_knowledge_chunks';

    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          projectId: string | null;
          sourceType: string;
          sourceId: string | null;
          content: string;
          similarityScore: number | null;
        }>
      >(
        `SELECT id, "projectId", "sourceType", "sourceId", "chunkText" AS content, NULL::double precision AS "similarityScore"
         FROM "${table}"
         WHERE "projectId" = $1
         ORDER BY "createdAt" DESC
         LIMIT $2`,
        projectId,
        limit,
      );
      return rows;
    } catch {
      return [];
    }
  }

  findPaymentsForRiskForecast(projectId: string) {
    return this.prisma.payment.findMany({
      where: {
        invoice: {
          projectId,
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        referenceNumber: true,
      },
    });
  }

  findPaymentsForRagIndexing(projectId: string) {
    return this.prisma.payment.findMany({
      where: {
        invoice: {
          projectId,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            dueDate: true,
            status: true,
          },
        },
      },
    });
  }

  upsertKnowledgeChunk(args: {
    projectId: string;
    sourceType: AiKnowledgeSourceType;
    sourceId: string;
    chunkText: string;
    metadata?: Prisma.InputJsonValue | null;
    embeddingModel?: string | null;
    embeddingDim?: number | null;
  }) {
    return this.prisma.aiKnowledgeChunk.upsert({
      where: {
        projectId_sourceType_sourceId: {
          projectId: args.projectId,
          sourceType: args.sourceType,
          sourceId: args.sourceId,
        },
      } as Prisma.AiKnowledgeChunkWhereUniqueInput,
      create: {
        projectId: args.projectId,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        chunkText: args.chunkText,
        metadata: args.metadata ?? undefined,
        embeddingModel: args.embeddingModel ?? undefined,
        embeddingDim: args.embeddingDim ?? undefined,
      },
      update: {
        chunkText: args.chunkText,
        metadata: args.metadata ?? undefined,
        embeddingModel: args.embeddingModel ?? undefined,
        embeddingDim: args.embeddingDim ?? undefined,
      },
      select: {
        id: true,
      },
    });
  }

  async setKnowledgeChunkEmbedding(chunkId: string, values: number[]) {
    const vectorLiteral = `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
    await this.prisma.$executeRawUnsafe(
      `UPDATE "ai_knowledge_chunks"
       SET "embedding" = $2::vector,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      chunkId,
      vectorLiteral,
    );
  }

  findKnowledgeChunksByProject(projectId: string, take: number) {
    return this.prisma.aiKnowledgeChunk.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      take,
    });
  }

  async findRelevantKnowledgeChunks(args: {
    projectId: string;
    topK: number;
    embedding?: number[] | null;
    similarityThreshold?: number | null;
  }) {
    if (!args.embedding || args.embedding.length === 0) {
      return this.findKnowledgeChunksByProject(args.projectId, args.topK);
    }

    const vectorLiteral = `[${args.embedding
      .map((value) => Number(value).toFixed(8))
      .join(',')}]`;

    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          projectId: string;
          sourceType: AiKnowledgeSourceType;
          sourceId: string;
          chunkText: string;
          metadata: Prisma.JsonValue | null;
          embeddingModel: string | null;
          embeddingDim: number | null;
          createdAt: Date;
          updatedAt: Date;
          similarityScore: number | null;
        }>
      >(
        `SELECT id,
                "projectId",
                "sourceType",
                "sourceId",
                "chunkText",
                metadata,
                "embeddingModel",
                "embeddingDim",
                "createdAt",
                "updatedAt",
                1 - ("embedding" <=> $2::vector) AS "similarityScore"
         FROM "ai_knowledge_chunks"
         WHERE "projectId" = $1
           AND "embedding" IS NOT NULL
           AND ($3::double precision IS NULL OR 1 - ("embedding" <=> $2::vector) >= $3)
         ORDER BY "embedding" <=> $2::vector
         LIMIT $4`,
        args.projectId,
        vectorLiteral,
        args.similarityThreshold ?? null,
        args.topK,
      );
      return rows;
    } catch {
      return this.findKnowledgeChunksByProject(args.projectId, args.topK);
    }
  }

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

  findRecentInvoices(where: Prisma.InvoiceWhereInput, take: number) {
    return this.prisma.invoice.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, projectName: true } },
      },
    });
  }

  findRecentPayments(where: Prisma.PaymentWhereInput, take: number) {
    return this.prisma.payment.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        invoice: {
          select: {
            id: true,
            project: { select: { id: true, projectName: true } },
          },
        },
      },
    });
  }

  findRecentProjects(where: Prisma.ProjectWhereInput, take: number) {
    return this.prisma.project.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  findRecentLeads(where: Prisma.LeadWhereInput, take: number) {
    return this.prisma.lead.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  findRecentQuotations(where: Prisma.QuotationWhereInput, take: number) {
    return this.prisma.quotation.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, projectName: true } },
      },
    });
  }

  findRecentDocuments(where: Prisma.DocumentWhereInput, take: number) {
    return this.prisma.document.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, projectName: true } },
        category: { select: { categoryName: true } },
      },
    });
  }

  findRecentMilestones(where: Prisma.MilestoneWhereInput, take: number) {
    return this.prisma.milestone.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, projectName: true } },
      },
    });
  }

  findProjectsForCompletionReport(args: Prisma.ProjectFindManyArgs) {
    return this.prisma.project.findMany({
      ...args,
      include: {
        milestones: {
          include: {
            tasks: {
              select: { id: true, status: true },
            },
          },
        },
      },
    });
  }

  countProjectsForReport(where: Prisma.ProjectWhereInput) {
    return this.prisma.project.count({ where });
  }

  aggregateExpenses(where: Prisma.ExpenseWhereInput) {
    return this.prisma.expense.aggregate({
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
  }

  groupExpensesByProject(where: Prisma.ExpenseWhereInput) {
    return this.prisma.expense.groupBy({
      by: ['projectId'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });
  }

  findProjectsByIds(projectIds: string[]) {
    return this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, projectName: true },
    });
  }

  findOverdueInvoices(args: Prisma.InvoiceFindManyArgs) {
    return this.prisma.invoice.findMany({
      ...args,
      include: {
        customer: { select: { id: true, fullName: true } },
        project: { select: { id: true, projectName: true } },
      },
    });
  }

  countOverdueInvoices(where: Prisma.InvoiceWhereInput) {
    return this.prisma.invoice.count({ where });
  }
}
