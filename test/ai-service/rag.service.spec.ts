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
    repository.upsertKnowledgeChunk.mockImplementation(
      ({ sourceId }: { sourceId: string }) =>
        Promise.resolve({ id: `chunk-${sourceId}` }),
    );
    repository.setKnowledgeChunkEmbedding.mockResolvedValue(undefined);
    service = new RagService(
      repository as unknown as AiRepository,
      configService as unknown as ConfigService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  const minimalProject = {
    id: 'proj-1',
    projectName: 'Tower',
    status: ProjectStatus.ACTIVE,
    location: null,
    budget: null,
    startDate: null,
    endDate: null,
    milestones: [],
    invoices: [],
    expenses: [],
  };

  function providerConfig(overrides: Record<string, string> = {}) {
    const values: Record<string, string> = {
      AI_API_KEY: 'test-key',
      ...overrides,
    };
    configService.get.mockImplementation((key: string) => values[key]);
  }

  function mockEmbeddingResponse(ok: boolean, payload: unknown) {
    return jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok,
      json: () => Promise.resolve(payload),
    } as Response);
  }

  it('indexes sparse historical records with safe labels and completed milestone metadata', async () => {
    repository.findProjectForRagIndexing.mockResolvedValue({
      ...minimalProject,
      milestones: [
        {
          id: 'm1',
          milestoneName: 'Completed',
          dueDate: new Date('2020-01-01'),
          status: MilestoneStatus.COMPLETED,
        },
        {
          id: 'm2',
          milestoneName: 'Unscheduled',
          dueDate: null,
          status: MilestoneStatus.PENDING,
        },
        {
          id: 'm3',
          milestoneName: 'Future',
          dueDate: new Date('2099-01-01'),
          status: MilestoneStatus.PENDING,
        },
      ],
      invoices: [
        {
          id: 'invoice-without-number',
          invoiceNumber: null,
          dueDate: null,
          status: InvoiceStatus.DRAFT,
          totalAmount: null,
          outstandingAmount: null,
        },
      ],
      expenses: [{ id: 'e1', amount: null, createdAt: null }],
    });
    repository.findPaymentsForRagIndexing.mockResolvedValue([
      {
        id: 'payment-without-reference',
        referenceNumber: null,
        paymentDate: null,
        amount: null,
        invoice: null,
      },
      {
        id: 'p2',
        referenceNumber: 'REF2',
        paymentDate: new Date('2026-10-01'),
        amount: 10,
        invoice: { id: 'i2', invoiceNumber: null, status: InvoiceStatus.PAID },
      },
    ]);
    await service.reindexProject('proj-1');
    const chunks = repository.upsertKnowledgeChunk.mock.calls.map(
      ([chunk]) =>
        chunk as {
          chunkText: string;
          metadata: Record<string, unknown>;
          sourceType: AiKnowledgeSourceType;
        },
    );
    expect(
      chunks
        .filter((chunk) => chunk.sourceType === AiKnowledgeSourceType.MILESTONE)
        .map((chunk) => chunk.metadata.delayed),
    ).toEqual([false, false, false]);
    expect(
      chunks.find((chunk) => chunk.sourceType === AiKnowledgeSourceType.PROJECT)
        ?.chunkText,
    ).toContain('an unspecified location');
    expect(
      chunks.find((chunk) => chunk.sourceType === AiKnowledgeSourceType.PAYMENT)
        ?.chunkText,
    ).toContain('unknown');
    expect(
      chunks.find((chunk) => chunk.sourceType === AiKnowledgeSourceType.INVOICE)
        ?.chunkText,
    ).toContain('invoice-');
    const [, vector] = repository.setKnowledgeChunkEmbedding.mock.calls[0] as [
      string,
      number[],
    ];
    expect(vector).toHaveLength(1536);
    expect(
      Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)),
    ).toBeCloseTo(1, 6);
  });

  it('indexes provider embeddings with the default model and document input type', async () => {
    providerConfig();
    const embedding = new Array<number>(1536).fill(0.25);
    const fetchMock = mockEmbeddingResponse(true, { data: [{ embedding }] });
    repository.findProjectForRagIndexing.mockResolvedValue(minimalProject);
    repository.findPaymentsForRagIndexing.mockResolvedValue([]);
    const result = await service.reindexProject('proj-1');
    expect(result.usedProviderEmbeddings).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(repository.setKnowledgeChunkEmbedding).toHaveBeenCalledWith(
      'chunk-proj-1',
      embedding,
    );
    const request = fetchMock.mock.calls[0][1];
    expect(request?.headers).toMatchObject({
      authorization: 'Bearer test-key',
    });
    expect(JSON.parse(request?.body as string)).toMatchObject({
      model: 'nvidia/llama-nemotron-embed-vl-1b-v2:free',
      input_type: 'search_document',
      dimensions: 1536,
    });
  });

  it('retrieves semantic context using an explicit model, API key and threshold', async () => {
    providerConfig({
      EMBEDDING_PROVIDER: 'OPENROUTER',
      EMBEDDING_API_KEY: 'embedding-key',
      EMBEDDING_MODEL: 'custom-model',
      RAG_SIMILARITY_THRESHOLD: 'invalid',
    });
    const embedding = new Array<number>(1536).fill(0.5);
    const fetchMock = mockEmbeddingResponse(true, { data: [{ embedding }] });
    repository.findRelevantKnowledgeChunks.mockResolvedValue([
      {
        id: 'c1',
        sourceType: AiKnowledgeSourceType.PROJECT,
        sourceId: null,
        projectId: 'proj-1',
        chunkText: 'history',
        similarityScore: 0.9,
        embeddingModel: null,
        embeddingDim: null,
        metadata: [],
        createdAt: new Date('2026-10-01'),
        updatedAt: new Date('2026-10-01'),
      },
    ]);
    const result = await service.retrieveProjectContext('proj-1');
    expect(result.topK).toBe(5);
    expect(result.usedVectorSearch).toBe(true);
    expect(result.hasEmbeddings).toBe(false);
    expect(result.items[0]).toMatchObject({
      sourceId: '',
      similarityScore: 0.9,
      metadata: null,
      embeddingModel: null,
      embeddingDim: null,
    });
    expect(repository.findRelevantKnowledgeChunks).toHaveBeenCalledWith({
      projectId: 'proj-1',
      topK: 5,
      embedding,
      similarityThreshold: null,
    });
    const request = fetchMock.mock.calls[0][1];
    expect(request?.headers).toMatchObject({
      authorization: 'Bearer embedding-key',
    });
    expect(JSON.parse(request?.body as string)).toMatchObject({
      model: 'custom-model',
      input_type: 'search_query',
    });
  });

  it.each([
    [false, {}],
    [true, {}],
    [true, { data: [] }],
    [true, { data: [{}] }],
    [true, { data: [{ embedding: [1, 2] }] }],
  ])(
    'uses deterministic embeddings when provider response is unusable (%s, %j)',
    async (ok, payload) => {
      providerConfig();
      mockEmbeddingResponse(ok, payload);
      repository.findRelevantKnowledgeChunks.mockResolvedValue([]);
      await service.retrieveProjectContext('proj-1', '', 2);
      const [args] = repository.findRelevantKnowledgeChunks.mock.calls[0] as [
        { embedding: number[] },
      ];
      expect(args.embedding).toHaveLength(1536);
      expect(args.embedding.every((value) => value === 0)).toBe(true);
    },
  );

  it.each([null, 'string metadata', []])(
    'returns null for non-object retrieval metadata %j',
    async (metadata) => {
      providerConfig({ EMBEDDING_PROVIDER: 'unsupported' });
      repository.findRelevantKnowledgeChunks.mockResolvedValue([
        {
          id: 'c1',
          sourceType: AiKnowledgeSourceType.PROJECT,
          sourceId: 'p1',
          projectId: 'proj-1',
          chunkText: 'history',
          embeddingModel: 'fallback',
          embeddingDim: 1536,
          metadata,
          createdAt: new Date('2026-10-01'),
          updatedAt: new Date('2026-10-01'),
        },
      ]);
      const result = await service.retrieveProjectContext('proj-1');
      expect(result.items[0]).toMatchObject({
        metadata: null,
        similarityScore: null,
      });
      expect(result.hasEmbeddings).toBe(true);
      expect(result.usedVectorSearch).toBe(false);
    },
  );

  it('does not persist a chunk when the embedding request fails', async () => {
    providerConfig();
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network offline'));
    repository.findProjectForRagIndexing.mockResolvedValue(minimalProject);
    repository.findPaymentsForRagIndexing.mockResolvedValue([]);
    await expect(service.reindexProject('proj-1')).rejects.toThrow(
      'network offline',
    );
    expect(repository.upsertKnowledgeChunk).not.toHaveBeenCalled();
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

    const result = await service.retrieveProjectContext(
      'proj-1',
      'delay risk',
      3,
    );

    expect(result.projectId).toBe('proj-1');
    expect(result.topK).toBe(3);
    expect(result.usedVectorSearch).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.warnings[0]).toContain(
      'Embedding provider is not configured',
    );
  });

  it('rejects reindexing when the project does not exist', async () => {
    repository.findProjectForRagIndexing.mockResolvedValue(null);
    repository.findPaymentsForRagIndexing.mockResolvedValue([]);

    await expect(
      service.reindexProject('missing-project'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
