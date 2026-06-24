import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AiKnowledgeSourceType } from '@prisma/client';
import { AiForecastingController } from '../../apps/ai-service/src/ai-forecasting.controller';
import { AiForecastingService } from '../../apps/ai-service/src/ai-forecasting.service';
import { RagController } from '../../apps/ai-service/src/rag.controller';
import { RagService } from '../../apps/ai-service/src/rag.service';

describe('AI Service routes - integration', () => {
  let app: INestApplication;

  const aiForecastingService = {
    predictProjectRisk: jest.fn(),
  };

  const ragService = {
    reindexProject: jest.fn(),
    retrieveProjectContext: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiForecastingController, RagController],
      providers: [
        {
          provide: AiForecastingService,
          useValue: aiForecastingService,
        },
        {
          provide: RagService,
          useValue: ragService,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /ai-forecasting/projects/:projectId/risk returns the prediction payload', async () => {
    aiForecastingService.predictProjectRisk.mockResolvedValue({
      projectId: 'f7745756-a906-4a6b-aaf5-b9c6b85146f8',
      projectName: 'AI Tower',
      projectRiskLevel: 'MEDIUM',
      paymentDelayRisk: 'LOW',
      milestoneDelayRisk: 'HIGH',
      revenueTrend: 'STABLE',
      explanation: 'Milestones need closer monitoring.',
      recommendedAction: 'Review the near-term delivery plan.',
      predictionSource: 'RULE_BASED',
      sufficientData: true,
      confidenceScore: 0.71,
      context: {
        projectId: 'f7745756-a906-4a6b-aaf5-b9c6b85146f8',
        projectName: 'AI Tower',
        projectStatus: 'ACTIVE',
        milestoneCount: 3,
        completedMilestoneCount: 1,
        invoiceCount: 2,
        overdueInvoiceCount: 1,
        paymentCount: 1,
        expenseCount: 1,
        retrievedChunks: [],
      },
      warnings: [],
      futureAdaptations: ['Add more vector-backed history.'],
      generatedAt: '2026-06-25T00:00:00.000Z',
    });

    const response = await request(app.getHttpServer())
      .get('/ai-forecasting/projects/f7745756-a906-4a6b-aaf5-b9c6b85146f8/risk')
      .expect(200);

    expect(response.body.projectId).toBe('f7745756-a906-4a6b-aaf5-b9c6b85146f8');
    expect(aiForecastingService.predictProjectRisk).toHaveBeenCalledWith(
      'f7745756-a906-4a6b-aaf5-b9c6b85146f8',
    );
  });

  it('GET /ai-forecasting/projects/:projectId/risk rejects invalid UUIDs before hitting the service', async () => {
    await request(app.getHttpServer())
      .get('/ai-forecasting/projects/not-a-uuid/risk')
      .expect(400);

    expect(aiForecastingService.predictProjectRisk).not.toHaveBeenCalled();
  });

  it('POST /ai-forecasting/rag/projects/:projectId/reindex returns the indexing summary', async () => {
    ragService.reindexProject.mockResolvedValue({
      projectId: '79f55f44-d848-4c3d-ac99-80eb731bda38',
      projectName: 'AI Tower',
      totalChunks: 5,
      projectChunks: 1,
      milestoneChunks: 1,
      invoiceChunks: 1,
      paymentChunks: 1,
      expenseChunks: 1,
      embeddingsGenerated: 5,
      usedProviderEmbeddings: false,
      warnings: [],
      futureAdaptations: ['Automate reindexing from domain events.'],
    });

    const response = await request(app.getHttpServer())
      .post('/ai-forecasting/rag/projects/79f55f44-d848-4c3d-ac99-80eb731bda38/reindex')
      .expect(201);

    expect(response.body.totalChunks).toBe(5);
    expect(ragService.reindexProject).toHaveBeenCalledWith(
      '79f55f44-d848-4c3d-ac99-80eb731bda38',
    );
  });

  it('GET /ai-forecasting/rag/projects/:projectId/chunks parses validated query params', async () => {
    ragService.retrieveProjectContext.mockResolvedValue({
      projectId: '79f55f44-d848-4c3d-ac99-80eb731bda38',
      query: 'payment delay risk',
      topK: 4,
      usedVectorSearch: false,
      hasEmbeddings: true,
      items: [
        {
          id: 'chunk-1',
          sourceType: AiKnowledgeSourceType.PROJECT,
          sourceId: '79f55f44-d848-4c3d-ac99-80eb731bda38',
          projectId: '79f55f44-d848-4c3d-ac99-80eb731bda38',
          chunkText: 'Project AI Tower is active.',
          similarityScore: null,
          embeddingModel: 'deterministic-fallback',
          embeddingDim: 1536,
          metadata: { status: 'ACTIVE' },
          createdAt: '2026-06-25T00:00:00.000Z',
          updatedAt: '2026-06-25T00:00:00.000Z',
        },
      ],
      warnings: [],
    });

    const response = await request(app.getHttpServer())
      .get('/ai-forecasting/rag/projects/79f55f44-d848-4c3d-ac99-80eb731bda38/chunks')
      .query({ query: 'payment delay risk', topK: '4' })
      .expect(200);

    expect(response.body.topK).toBe(4);
    expect(ragService.retrieveProjectContext).toHaveBeenCalledWith(
      '79f55f44-d848-4c3d-ac99-80eb731bda38',
      'payment delay risk',
      4,
    );
  });

  it('GET /ai-forecasting/rag/projects/:projectId/chunks rejects invalid topK values', async () => {
    await request(app.getHttpServer())
      .get('/ai-forecasting/rag/projects/79f55f44-d848-4c3d-ac99-80eb731bda38/chunks')
      .query({ topK: '50' })
      .expect(400);

    expect(ragService.retrieveProjectContext).not.toHaveBeenCalled();
  });

  it('surfaces service-level not found errors as HTTP 404 responses', async () => {
    aiForecastingService.predictProjectRisk.mockRejectedValue(
      new NotFoundException({
        code: 'PROJECT_NOT_FOUND',
        message: 'Missing project.',
      }),
    );

    const response = await request(app.getHttpServer())
      .get('/ai-forecasting/projects/f7745756-a906-4a6b-aaf5-b9c6b85146f8/risk')
      .expect(404);

    expect(response.body.code).toBe('PROJECT_NOT_FOUND');
  });
});
