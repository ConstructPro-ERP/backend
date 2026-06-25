import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiKnowledgeSourceType,
  InvoiceStatus,
  MilestoneStatus,
  ProjectStatus,
} from '@prisma/client';
import { RagService } from '../../apps/ai-service/src/rag.service';
import { AiRepository } from '../../apps/ai-service/src/repositories/ai.repository';

const repository = {
  findProjectForRagIndexing: jest.fn(),
  findPaymentsForRagIndexing: jest.fn(),
  upsertKnowledgeChunk: jest.fn(),
  setKnowledgeChunkEmbedding: jest.fn(),
  findRelevantKnowledgeChunks: jest.fn(),
};

const configService = {
  get: jest.fn(),
};

describe('RagService', () => {
  let service: RagService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      if (key === 'RAG_TOP_K') return '5';
      if (key === 'RAG_SIMILARITY_THRESHOLD') return '0.75';
      return undefined;
    });
    repository.upsertKnowledgeChunk.mockImplementation(({ sourceId }: { sourceId: string }) =>
      Promise.resolve({ id: `chunk-${sourceId}` }),
    );
    repository.setKnowledgeChunkEmbedding.mockResolvedValue(undefined);
    service = new RagService(
      repository as unknown as AiRepository,
      configService as unknown as ConfigService,
    );
  });

  it('indexes project, milestone, invoice, payment, and expense chunks', async () => {
    repository.findProjectForRagIndexing.mockResolvedValue({
      id: 'proj-1',
      projectName: 'Tower A',
      status: ProjectStatus.ACTIVE,
      location: 'Colombo',
      budget: 125000,
      startDate: new Date('2026-06-01T00:00:00Z'),
      endDate: null,
      milestones: [
        {
          id: 'ms-1',
          milestoneName: 'Foundation',
          dueDate: new Date('2026-06-10T00:00:00Z'),
          status: MilestoneStatus.IN_PROGRESS,
          createdAt: new Date('2026-06-02T00:00:00Z'),
        },
      ],
      invoices: [
        {
          id: 'inv-1',
          invoiceNumber: 'INV-001',
          dueDate: new Date('2026-06-20T00:00:00Z'),
          status: InvoiceStatus.OVERDUE,
          totalAmount: { toNumber: () => 10000 },
          outstandingAmount: { toNumber: () => 3000 },
          createdAt: new Date('2026-06-05T00:00:00Z'),
        },
      ],
      expenses: [
        {
          id: 'exp-1',
          amount: 900,
          createdAt: new Date('2026-06-06T00:00:00Z'),
        },
      ],
    });
    repository.findPaymentsForRagIndexing.mockResolvedValue([
      {
        id: 'pay-1',
        referenceNumber: 'PAY-001',
        paymentDate: new Date('2026-06-07T00:00:00Z'),
        amount: { toNumber: () => 7000 },
        invoice: {
          id: 'inv-1',
          invoiceNumber: 'INV-001',
          status: InvoiceStatus.OVERDUE,
        },
      },
    ]);

    const result = await service.reindexProject('proj-1');

    expect(result.totalChunks).toBe(5);
    expect(result.projectChunks).toBe(1);
    expect(result.milestoneChunks).toBe(1);
    expect(result.invoiceChunks).toBe(1);
    expect(result.paymentChunks).toBe(1);
    expect(result.expenseChunks).toBe(1);
    expect(result.embeddingsGenerated).toBe(5);
    expect(result.usedProviderEmbeddings).toBe(false);
    expect(repository.upsertKnowledgeChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: AiKnowledgeSourceType.PROJECT,
        sourceId: 'proj-1',
      }),
    );
  });

  it('retrieves project chunks with safe fallback when embeddings are unavailable', async () => {
    repository.findRelevantKnowledgeChunks.mockResolvedValue([
      {
        id: 'chunk-1',
        sourceType: AiKnowledgeSourceType.PROJECT,
        sourceId: 'proj-1',
        projectId: 'proj-1',
        chunkText: 'Project Tower A is active.',
        similarityScore: null,
        embeddingModel: 'deterministic-fallback',
        embeddingDim: 1536,
        metadata: { status: 'ACTIVE' },
        createdAt: new Date('2026-06-10T00:00:00Z'),
        updatedAt: new Date('2026-06-10T00:00:00Z'),
      },
    ]);

    const result = await service.retrieveProjectContext('proj-1', 'delay risk', 3);

    expect(result.projectId).toBe('proj-1');
    expect(result.topK).toBe(3);
    expect(result.usedVectorSearch).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.warnings[0]).toContain('Embedding provider is not configured');
  });

  it('rejects reindexing when the project does not exist', async () => {
    repository.findProjectForRagIndexing.mockResolvedValue(null);
    repository.findPaymentsForRagIndexing.mockResolvedValue([]);

    await expect(service.reindexProject('missing-project')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
