import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceStatus, MilestoneStatus, ProjectStatus } from '@prisma/client';
import { AiPromptService } from './ai-prompt.service';
import { AiProviderService } from './ai-provider.service';
import { AiForecastingService } from './ai-forecasting.service';
import {
  PredictionSourceDto,
  RevenueTrendDto,
  RiskLevelDto,
} from './dto/ai-forecasting.dto';
import { AiRepository } from './repositories/ai.repository';

const repository = {
  findProjectForRiskForecast: jest.fn(),
  findPaymentsForRiskForecast: jest.fn(),
  findVectorKnowledgeChunks: jest.fn(),
};

const configService = {
  get: jest.fn(),
};

const aiPromptService = {
  buildRiskPredictionPrompt: jest.fn(),
};

const aiProviderService = {
  predictViaProvider: jest.fn(),
};

describe('AiForecastingService', () => {
  let service: AiForecastingService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      if (key === 'RAG_TOP_K') return '5';
      return undefined;
    });
    repository.findPaymentsForRiskForecast.mockResolvedValue([]);
    repository.findVectorKnowledgeChunks.mockResolvedValue([]);
    aiPromptService.buildRiskPredictionPrompt.mockReturnValue({
      systemPrompt: 'system',
      userPrompt: 'user',
      warnings: [],
      chunks: [],
    });
    aiProviderService.predictViaProvider.mockResolvedValue(null);
    service = new AiForecastingService(
      repository as unknown as AiRepository,
      configService as unknown as ConfigService,
      aiPromptService as unknown as AiPromptService,
      aiProviderService as unknown as AiProviderService,
    );
  });

  it('rejects invalid project ids when the project does not exist', async () => {
    repository.findProjectForRiskForecast.mockResolvedValue(null);

    await expect(service.predictProjectRisk('missing-project')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns an insufficient-data safe fallback when history is too sparse', async () => {
    repository.findProjectForRiskForecast.mockResolvedValue({
      id: '8df76ed3-983b-4648-b421-e8d98484e234',
      projectName: 'Minimal Project',
      status: ProjectStatus.PLANNING,
      budget: 50000,
      milestones: [],
      invoices: [],
      expenses: [],
    });

    const result = await service.predictProjectRisk(
      '8df76ed3-983b-4648-b421-e8d98484e234',
    );

    expect(result.predictionSource).toBe(PredictionSourceDto.SAFE_FALLBACK);
    expect(result.sufficientData).toBe(false);
    expect(result.warnings).toContain(
      'Neon pgvector retrieval is not configured; using relational fallback retrieval.',
    );
    expect(result.futureAdaptations.length).toBeGreaterThan(0);
  });

  it('returns a rule-based prediction when project history is available', async () => {
    repository.findProjectForRiskForecast.mockResolvedValue({
      id: '4d2d9cd8-9772-4ab0-a55a-504cb9c5e4e9',
      projectName: 'Tower A',
      status: ProjectStatus.ACTIVE,
      budget: 100000,
      milestones: [
        {
          id: 'ms-1',
          milestoneName: 'Foundation',
          dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          status: MilestoneStatus.IN_PROGRESS,
          createdAt: new Date('2026-06-01T00:00:00Z'),
        },
        {
          id: 'ms-2',
          milestoneName: 'Roofing',
          dueDate: new Date('2026-07-10T00:00:00Z'),
          status: MilestoneStatus.COMPLETED,
          createdAt: new Date('2026-06-02T00:00:00Z'),
        },
      ],
      invoices: [
        {
          id: 'inv-1',
          invoiceNumber: 'INV-001',
          dueDate: new Date('2026-06-10T00:00:00Z'),
          status: InvoiceStatus.OVERDUE,
          totalAmount: { toNumber: () => 10000 },
          outstandingAmount: { toNumber: () => 4000 },
          createdAt: new Date('2026-06-05T00:00:00Z'),
        },
      ],
      expenses: [
        {
          id: 'exp-1',
          amount: 2500,
          createdAt: new Date('2026-06-03T00:00:00Z'),
        },
      ],
    });
    repository.findPaymentsForRiskForecast.mockResolvedValue([
      {
        id: 'pay-1',
        amount: { toNumber: () => 6000 },
        paymentDate: new Date('2026-06-08T00:00:00Z'),
        referenceNumber: 'PAY-001',
      },
    ]);

    const result = await service.predictProjectRisk(
      '4d2d9cd8-9772-4ab0-a55a-504cb9c5e4e9',
    );

    expect(result.predictionSource).toBe(PredictionSourceDto.RULE_BASED);
    expect(result.projectRiskLevel).toBe(RiskLevelDto.MEDIUM);
    expect(result.paymentDelayRisk).toBe(RiskLevelDto.HIGH);
    expect(result.milestoneDelayRisk).toBe(RiskLevelDto.HIGH);
    expect(result.revenueTrend).toBe(RevenueTrendDto.GROWING);
    expect(result.context.retrievedChunks.length).toBeGreaterThanOrEqual(3);
  });

  it('uses provider output when the provider returns a valid structured prediction', async () => {
    repository.findProjectForRiskForecast.mockResolvedValue({
      id: '4d2d9cd8-9772-4ab0-a55a-504cb9c5e4e9',
      projectName: 'Tower A',
      status: ProjectStatus.ACTIVE,
      budget: 100000,
      milestones: [
        {
          id: 'ms-1',
          milestoneName: 'Foundation',
          dueDate: new Date('2026-07-10T00:00:00Z'),
          status: MilestoneStatus.IN_PROGRESS,
          createdAt: new Date('2026-06-01T00:00:00Z'),
        },
      ],
      invoices: [
        {
          id: 'inv-1',
          invoiceNumber: 'INV-001',
          dueDate: new Date('2026-06-10T00:00:00Z'),
          status: InvoiceStatus.OVERDUE,
          totalAmount: { toNumber: () => 10000 },
          outstandingAmount: { toNumber: () => 4000 },
          createdAt: new Date('2026-06-05T00:00:00Z'),
        },
      ],
      expenses: [
        {
          id: 'exp-1',
          amount: 2500,
          createdAt: new Date('2026-06-03T00:00:00Z'),
        },
      ],
    });
    repository.findPaymentsForRiskForecast.mockResolvedValue([
      {
        id: 'pay-1',
        amount: { toNumber: () => 6000 },
        paymentDate: new Date('2026-06-08T00:00:00Z'),
        referenceNumber: 'PAY-001',
      },
    ]);
    aiPromptService.buildRiskPredictionPrompt.mockReturnValue({
      systemPrompt: 'system',
      userPrompt: 'user',
      warnings: ['Prompt context was limited to 1 chunks by AI_MAX_CONTEXT_CHUNKS.'],
      chunks: [],
    });
    aiProviderService.predictViaProvider.mockResolvedValue({
      projectRiskLevel: RiskLevelDto.HIGH,
      paymentDelayRisk: RiskLevelDto.MEDIUM,
      milestoneDelayRisk: RiskLevelDto.HIGH,
      revenueTrend: RevenueTrendDto.STABLE,
      explanation: 'Provider explanation',
      recommendedAction: 'Provider action',
      confidenceScore: 0.82,
      warnings: ['Provider warning'],
    });

    const result = await service.predictProjectRisk(
      '4d2d9cd8-9772-4ab0-a55a-504cb9c5e4e9',
    );

    expect(result.predictionSource).toBe(PredictionSourceDto.AI_PROVIDER);
    expect(result.explanation).toBe('Provider explanation');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'Prompt context was limited to 1 chunks by AI_MAX_CONTEXT_CHUNKS.',
        'Provider warning',
      ]),
    );
  });
});
