import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiKnowledgeSourceType, type Prisma } from '@prisma/client';
import { RagIndexingSummaryDto, RagRetrievalResponseDto } from './dto/rag.dto';
import { AiRepository } from './repositories/ai.repository';

type IndexedChunk = {
  sourceType: AiKnowledgeSourceType;
  sourceId: string;
  chunkText: string;
  metadata: Prisma.InputJsonValue;
};

@Injectable()
export class RagService {
  constructor(
    private readonly aiRepository: AiRepository,
    private readonly configService: ConfigService,
  ) {}

  async reindexProject(projectId: string): Promise<RagIndexingSummaryDto> {
    const [project, payments] = await Promise.all([
      this.aiRepository.findProjectForRagIndexing(projectId),
      this.aiRepository.findPaymentsForRagIndexing(projectId),
    ]);

    if (!project) {
      throw new NotFoundException({
        code: 'PROJECT_NOT_FOUND',
        message: `Project ${projectId} was not found.`,
      });
    }

    const chunks = buildChunks(project, payments);
    const warnings: string[] = [];
    const providerEmbeddings = this.hasProviderEmbeddings();
    let embeddingsGenerated = 0;

    if (!providerEmbeddings) {
      warnings.push(
        'Embedding provider is not configured; deterministic fallback embeddings were used for indexing.',
      );
    }

    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk.chunkText);
      const row = await this.aiRepository.upsertKnowledgeChunk({
        projectId: project.id,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        chunkText: chunk.chunkText,
        metadata: chunk.metadata,
        embeddingModel:
          this.configService.get<string>('EMBEDDING_MODEL') ??
          (providerEmbeddings ? 'provider-default' : 'deterministic-fallback'),
        embeddingDim: embedding.length,
      });
      await this.aiRepository.setKnowledgeChunkEmbedding(row.id, embedding);
      embeddingsGenerated += 1;
    }

    return {
      projectId: project.id,
      projectName: project.projectName,
      totalChunks: chunks.length,
      projectChunks: chunks.filter(
        (chunk) => chunk.sourceType === AiKnowledgeSourceType.PROJECT,
      ).length,
      milestoneChunks: chunks.filter(
        (chunk) => chunk.sourceType === AiKnowledgeSourceType.MILESTONE,
      ).length,
      invoiceChunks: chunks.filter(
        (chunk) => chunk.sourceType === AiKnowledgeSourceType.INVOICE,
      ).length,
      paymentChunks: chunks.filter(
        (chunk) => chunk.sourceType === AiKnowledgeSourceType.PAYMENT,
      ).length,
      expenseChunks: chunks.filter(
        (chunk) => chunk.sourceType === AiKnowledgeSourceType.EXPENSE,
      ).length,
      embeddingsGenerated,
      usedProviderEmbeddings: providerEmbeddings,
      warnings,
      futureAdaptations: [
        'Run this reindex flow from domain events or scheduled backfill jobs instead of manual triggering.',
        'Replace fallback embeddings with approved provider embeddings in shared environments.',
        'Extend expense metadata when expense categories become available in the source schema.',
      ],
    };
  }

  async retrieveProjectContext(
    projectId: string,
    query?: string,
    topK?: number,
  ): Promise<RagRetrievalResponseDto> {
    const effectiveTopK =
      topK ??
      Number.parseInt(this.configService.get<string>('RAG_TOP_K') ?? '5', 10) ??
      5;
    const effectiveQuery =
      query ??
      'project delay risk payment delay risk milestone delay risk revenue trend';
    const providerEmbeddings = this.hasProviderEmbeddings();
    const warnings: string[] = [];

    if (!providerEmbeddings) {
      warnings.push(
        'Embedding provider is not configured; retrieval used stored chunk recency fallback instead of semantic similarity.',
      );
    }

    const queryEmbedding = providerEmbeddings
      ? await this.generateEmbedding(effectiveQuery)
      : null;

    const threshold = Number.parseFloat(
      this.configService.get<string>('RAG_SIMILARITY_THRESHOLD') ?? '0.75',
    );

    const items = (await this.aiRepository.findRelevantKnowledgeChunks({
      projectId,
      topK: effectiveTopK,
      embedding: queryEmbedding,
      similarityThreshold: Number.isFinite(threshold) ? threshold : null,
    })) as Array<{
      id: string;
      sourceType: AiKnowledgeSourceType;
      sourceId: string | null;
      projectId: string;
      chunkText: string;
      similarityScore?: number | null;
      embeddingModel: string | null;
      embeddingDim: number | null;
      metadata: unknown;
      createdAt: Date;
      updatedAt: Date;
    }>;

    return {
      projectId,
      query: effectiveQuery,
      topK: effectiveTopK,
      usedVectorSearch: providerEmbeddings,
      hasEmbeddings: items.some((item) => item.embeddingDim !== null),
      items: items.map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        sourceId: item.sourceId ?? '',
        projectId: item.projectId,
        chunkText: item.chunkText,
        similarityScore:
          typeof item.similarityScore === 'number'
            ? item.similarityScore
            : null,
        embeddingModel: item.embeddingModel ?? null,
        embeddingDim: item.embeddingDim ?? null,
        metadata: isObject(item.metadata) ? item.metadata : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      warnings,
    };
  }

  private hasProviderEmbeddings() {
    return Boolean(
      this.configService.get<string>('EMBEDDING_PROVIDER') &&
      this.configService.get<string>('EMBEDDING_API_KEY'),
    );
  }

  private async generateEmbedding(input: string): Promise<number[]> {
    if (!this.hasProviderEmbeddings()) {
      return deterministicEmbedding(input);
    }

    const provider = this.configService.get<string>('EMBEDDING_PROVIDER');
    if (provider?.toLowerCase() !== 'openai') {
      return deterministicEmbedding(input);
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.configService.get<string>('EMBEDDING_API_KEY')}`,
      },
      body: JSON.stringify({
        model:
          this.configService.get<string>('EMBEDDING_MODEL') ??
          'text-embedding-3-small',
        input,
      }),
    });

    if (!response.ok) {
      return deterministicEmbedding(input);
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = payload.data?.[0]?.embedding;
    return embedding?.length ? embedding : deterministicEmbedding(input);
  }
}

function buildChunks(
  project: Awaited<
    ReturnType<AiRepository['findProjectForRagIndexing']>
  > extends infer T
    ? NonNullable<T>
    : never,
  payments: Awaited<ReturnType<AiRepository['findPaymentsForRagIndexing']>>,
): IndexedChunk[] {
  const chunks: IndexedChunk[] = [];

  chunks.push({
    sourceType: AiKnowledgeSourceType.PROJECT,
    sourceId: project.id,
    chunkText: `Project ${project.projectName} is ${project.status} in ${project.location ?? 'an unspecified location'} with budget ${money(project.budget)} from ${dateLabel(project.startDate)} to ${dateLabel(project.endDate)}.`,
    metadata: {
      status: project.status,
      budget: money(project.budget),
      location: project.location,
      startDate: isoDate(project.startDate),
      endDate: isoDate(project.endDate),
    },
  });

  for (const milestone of project.milestones) {
    chunks.push({
      sourceType: AiKnowledgeSourceType.MILESTONE,
      sourceId: milestone.id,
      chunkText: `Milestone ${milestone.milestoneName} for project ${project.projectName} is ${milestone.status} and due on ${dateLabel(milestone.dueDate)}.`,
      metadata: {
        status: milestone.status,
        dueDate: isoDate(milestone.dueDate),
        delayed:
          Boolean(milestone.dueDate) &&
          milestone.status !== 'COMPLETED' &&
          milestone.dueDate!.getTime() < Date.now(),
      },
    });
  }

  for (const invoice of project.invoices) {
    chunks.push({
      sourceType: AiKnowledgeSourceType.INVOICE,
      sourceId: invoice.id,
      chunkText: `Invoice ${invoice.invoiceNumber ?? invoice.id.slice(0, 8)} for project ${project.projectName} is ${invoice.status}, due on ${dateLabel(invoice.dueDate)}, total ${money(invoice.totalAmount)}, outstanding ${money(invoice.outstandingAmount)}.`,
      metadata: {
        status: invoice.status,
        dueDate: isoDate(invoice.dueDate),
        totalAmount: money(invoice.totalAmount),
        outstandingAmount: money(invoice.outstandingAmount),
      },
    });
  }

  for (const payment of payments) {
    chunks.push({
      sourceType: AiKnowledgeSourceType.PAYMENT,
      sourceId: payment.id,
      chunkText: `Payment ${payment.referenceNumber ?? payment.id.slice(0, 8)} recorded on ${dateLabel(payment.paymentDate)} for amount ${money(payment.amount)} related to invoice ${payment.invoice?.invoiceNumber ?? payment.invoice?.id ?? 'unknown'}.`,
      metadata: {
        paymentDate: isoDate(payment.paymentDate),
        amount: money(payment.amount),
        invoiceId: payment.invoice?.id ?? null,
        invoiceStatus: payment.invoice?.status ?? null,
      },
    });
  }

  for (const expense of project.expenses) {
    chunks.push({
      sourceType: AiKnowledgeSourceType.EXPENSE,
      sourceId: expense.id,
      chunkText: `Expense recorded for project ${project.projectName} on ${dateLabel(expense.createdAt)} with amount ${money(expense.amount)}.`,
      metadata: {
        amount: money(expense.amount),
        createdAt: isoDate(expense.createdAt),
      },
    });
  }

  return chunks;
}

function deterministicEmbedding(input: string, dimensions = 1536) {
  const vector = new Array<number>(dimensions).fill(0);
  for (let index = 0; index < input.length; index += 1) {
    const slot = index % dimensions;
    vector[slot] += (input.charCodeAt(index) % 31) / 31;
  }
  const magnitude =
    Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function dateLabel(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : 'not scheduled';
}

function money(value: { toNumber(): number } | number | null | undefined) {
  if (typeof value === 'number') return Math.round(value * 100) / 100;
  if (value && 'toNumber' in value)
    return Math.round(value.toNumber() * 100) / 100;
  return 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
