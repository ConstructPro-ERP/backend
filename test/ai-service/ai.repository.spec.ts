import { AiKnowledgeSourceType } from '@prisma/client';
import { AiRepository } from '../../apps/ai-service/src/repositories/ai.repository';
import { AnalyticsRepository } from '../../apps/analytics-service/src/repositories/analytics.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { createPrismaMock, objectContaining } from '../support/prisma.mock';

describe.each([AiRepository, AnalyticsRepository])(
  '%s knowledge queries',
  (Repository) => {
    let prisma: ReturnType<typeof createPrismaMock>;
    let repository: AiRepository | AnalyticsRepository;
    let originalTable: string | undefined;

    beforeEach(() => {
      prisma = createPrismaMock();
      repository = new Repository(prisma as unknown as PrismaService);
      originalTable = process.env.RAG_VECTOR_TABLE;
      delete process.env.RAG_VECTOR_TABLE;
    });
    afterEach(() => {
      if (originalTable === undefined) delete process.env.RAG_VECTOR_TABLE;
      else process.env.RAG_VECTOR_TABLE = originalTable;
    });

    it('scopes source history to the requested project and includes invoice context for indexing', async () => {
      await repository.findProjectForRagIndexing('p1');
      expect(prisma.project.findUnique).toHaveBeenLastCalledWith(
        objectContaining({
          where: { id: 'p1' },
          include: objectContaining({
            invoices: expect.any(Object) as unknown,
            milestones: expect.any(Object) as unknown,
            expenses: expect.any(Object) as unknown,
          }),
        }),
      );
      await repository.findProjectForRiskForecast('p1');
      expect(prisma.project.findUnique).toHaveBeenLastCalledWith(
        objectContaining({ where: { id: 'p1' } }),
      );
      await repository.findPaymentsForRagIndexing('p1');
      expect(prisma.payment.findMany).toHaveBeenLastCalledWith(
        objectContaining({
          where: { invoice: { projectId: 'p1' } },
          include: objectContaining({ invoice: expect.any(Object) as unknown }),
        }),
      );
      await repository.findPaymentsForRiskForecast('p1');
      expect(prisma.payment.findMany).toHaveBeenLastCalledWith(
        objectContaining({
          where: { invoice: { projectId: 'p1' } },
          select: objectContaining({ amount: true, paymentDate: true }),
        }),
      );
    });

    it.each([undefined, 'custom_chunks'])(
      'parameterizes project and result limit with table %s',
      async (table) => {
        if (table) process.env.RAG_VECTOR_TABLE = table;
        prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'c1' }]);
        await expect(
          repository.findVectorKnowledgeChunks('p1', 3),
        ).resolves.toEqual([{ id: 'c1' }]);
        expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining(`FROM "${table ?? 'ai_knowledge_chunks'}"`),
          'p1',
          3,
        );
      },
    );

    it('returns empty vector history when the optional vector table is unavailable', async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error('missing table'));
      await expect(
        repository.findVectorKnowledgeChunks('p1', 3),
      ).resolves.toEqual([]);
    });

    it.each([
      {},
      {
        metadata: { status: 'ACTIVE' },
        embeddingModel: 'model',
        embeddingDim: 2,
      },
      { metadata: null, embeddingModel: null, embeddingDim: null },
    ])(
      'upserts chunks by project, source type and source ID with optional metadata %j',
      async (options) => {
        await repository.upsertKnowledgeChunk({
          projectId: 'p1',
          sourceId: 'i1',
          sourceType: AiKnowledgeSourceType.INVOICE,
          chunkText: 'invoice history',
          ...options,
        });
        expect(prisma.aiKnowledgeChunk.upsert).toHaveBeenCalledWith(
          objectContaining({
            where: {
              projectId_sourceType_sourceId: {
                projectId: 'p1',
                sourceType: AiKnowledgeSourceType.INVOICE,
                sourceId: 'i1',
              },
            },
            create: objectContaining({
              chunkText: 'invoice history',
              metadata: options.metadata ?? undefined,
            }),
            update: objectContaining({
              chunkText: 'invoice history',
              embeddingDim: options.embeddingDim ?? undefined,
            }),
          }),
        );
      },
    );

    it('writes fixed precision vectors using bound parameters', async () => {
      await repository.setKnowledgeChunkEmbedding('c1', [0.5, -0.123456789]);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('$2::vector'),
        'c1',
        '[0.50000000,-0.12345679]',
      );
    });

    it.each([undefined, null, []])(
      'uses project-scoped recency retrieval without a usable embedding: %j',
      async (embedding) => {
        prisma.aiKnowledgeChunk.findMany.mockResolvedValue([{ id: 'recent' }]);
        await expect(
          repository.findRelevantKnowledgeChunks({
            projectId: 'p1',
            topK: 4,
            embedding,
          }),
        ).resolves.toEqual([{ id: 'recent' }]);
        expect(prisma.aiKnowledgeChunk.findMany).toHaveBeenCalledWith({
          where: { projectId: 'p1' },
          orderBy: { updatedAt: 'desc' },
          take: 4,
        });
        expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
      },
    );

    it.each([undefined, null, 0.8])(
      'binds similarity threshold %s and vector search limit',
      async (similarityThreshold) => {
        prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'semantic' }]);
        await expect(
          repository.findRelevantKnowledgeChunks({
            projectId: 'p1',
            topK: 2,
            embedding: [0.25, 0.5],
            similarityThreshold,
          }),
        ).resolves.toEqual([{ id: 'semantic' }]);
        expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('"embedding" IS NOT NULL'),
          'p1',
          '[0.25000000,0.50000000]',
          similarityThreshold ?? null,
          2,
        );
      },
    );

    it('falls back to recency when vector retrieval fails', async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(
        new Error('vector extension unavailable'),
      );
      prisma.aiKnowledgeChunk.findMany.mockResolvedValue([{ id: 'fallback' }]);
      await expect(
        repository.findRelevantKnowledgeChunks({
          projectId: 'p1',
          topK: 1,
          embedding: [1],
        }),
      ).resolves.toEqual([{ id: 'fallback' }]);
    });
  },
);
