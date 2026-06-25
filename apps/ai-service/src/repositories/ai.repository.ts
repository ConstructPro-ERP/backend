import { Injectable } from '@nestjs/common';
import { AiKnowledgeSourceType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

type VectorKnowledgeChunkRow = {
  id: string;
  projectId: string | null;
  sourceType: string;
  sourceId: string | null;
  content: string;
  similarityScore: number | null;
};

type RelevantKnowledgeChunkRow = {
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
};

@Injectable()
export class AiRepository {
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
      return await this.prisma.$queryRawUnsafe<VectorKnowledgeChunkRow[]>(
        `SELECT id, "projectId", "sourceType", "sourceId", "chunkText" AS content, NULL::double precision AS "similarityScore"
         FROM "${table}"
         WHERE "projectId" = $1
         ORDER BY "createdAt" DESC
         LIMIT $2`,
        projectId,
        limit,
      );
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
    const where = Prisma.validator<Prisma.AiKnowledgeChunkWhereUniqueInput>()({
      projectId_sourceType_sourceId: {
        projectId: args.projectId,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
      },
    });

    return this.prisma.aiKnowledgeChunk.upsert({
      where,
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
    const vectorLiteral = `[${values
      .map((value) => Number(value).toFixed(8))
      .join(',')}]`;

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
      return await this.prisma.$queryRawUnsafe<RelevantKnowledgeChunkRow[]>(
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
    } catch {
      return this.findKnowledgeChunksByProject(args.projectId, args.topK);
    }
  }
}
