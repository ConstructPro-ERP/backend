import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceStatus, MilestoneStatus, ProjectStatus } from '@prisma/client';
import {
  AiProviderPredictionResponseDto,
  AiRiskPredictionResponseDto,
  PredictionSourceDto,
  RetrievedChunkDto,
  RevenueTrendDto,
  RiskLevelDto,
} from './dto/ai-forecasting.dto';
import { AnalyticsRepository } from './repositories/analytics.repository';

type ProjectForecastRecord = Awaited<
  ReturnType<AnalyticsRepository['findProjectForRiskForecast']>
>;

@Injectable()
export class AiForecastingService {
  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly configService: ConfigService,
  ) {}

  async predictProjectRisk(projectId: string): Promise<AiRiskPredictionResponseDto> {
    const [project, payments] = await Promise.all([
      this.analyticsRepository.findProjectForRiskForecast(projectId),
      this.analyticsRepository.findPaymentsForRiskForecast(projectId),
    ]);

    if (!project) {
      throw new NotFoundException({
        code: 'PROJECT_NOT_FOUND',
        message: `Project ${projectId} was not found.`,
      });
    }

    const projectWithPayments = {
      ...project,
      payments,
    };

    const retrievedChunks = await this.retrieveRelevantChunks(projectWithPayments);
    const warnings: string[] = [];
    const futureAdaptations = this.futureAdaptations();

    if (!this.isVectorSearchEnabled()) {
      warnings.push(
        'Neon pgvector retrieval is not configured; using relational fallback retrieval.',
      );
    }

    const fallbackPrediction = this.buildRuleBasedPrediction(
      projectWithPayments,
      retrievedChunks,
      warnings,
      futureAdaptations,
    );

    if (!this.hasEnoughData(projectWithPayments, retrievedChunks)) {
      return {
        ...fallbackPrediction,
        predictionSource: PredictionSourceDto.SAFE_FALLBACK,
        sufficientData: false,
        explanation:
          'There is not enough historical project context to produce a confident AI prediction yet.',
        recommendedAction:
          'Capture more milestones, payments, invoices, and expenses for this project before relying on automated risk predictions.',
        confidenceScore: 0.25,
      };
    }

    try {
      const providerPrediction = await this.requestProviderPrediction(
        projectWithPayments,
        retrievedChunks,
      );

      if (!providerPrediction) {
        return fallbackPrediction;
      }

      return {
        ...fallbackPrediction,
        ...providerPrediction,
        predictionSource: PredictionSourceDto.AI_PROVIDER,
        warnings: [...warnings, ...(providerPrediction.warnings ?? [])],
      };
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      return {
        ...fallbackPrediction,
        predictionSource: PredictionSourceDto.SAFE_FALLBACK,
        warnings: [
          ...warnings,
          'AI provider request failed; safe rule-based fallback was returned.',
        ],
      };
    }
  }

  private async retrieveRelevantChunks(
    project: NonNullable<ProjectForecastRecord> & {
      payments: Awaited<
        ReturnType<AnalyticsRepository['findPaymentsForRiskForecast']>
      >;
    },
  ): Promise<RetrievedChunkDto[]> {
    const topK = Number.parseInt(
      this.configService.get<string>('RAG_TOP_K') ?? '5',
      10,
    );
    const relationalChunks = this.buildRelationalChunks(project);

    if (!this.isVectorSearchEnabled()) {
      return relationalChunks.slice(0, topK);
    }

    const vectorChunks = await this.analyticsRepository.findVectorKnowledgeChunks(
      project.id,
      Number.isFinite(topK) ? topK : 5,
    );

    if (vectorChunks.length > 0) {
      return vectorChunks.map((chunk) => ({
        id: chunk.id,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        summary: chunk.content,
        similarityScore: chunk.similarityScore,
        relatedProjectId: chunk.projectId,
      }));
    }

    return relationalChunks.slice(0, topK);
  }

  private buildRelationalChunks(
    project: NonNullable<ProjectForecastRecord> & {
      payments: Awaited<
        ReturnType<AnalyticsRepository['findPaymentsForRiskForecast']>
      >;
    },
  ): RetrievedChunkDto[] {
    const chunks: RetrievedChunkDto[] = [];

    chunks.push({
      id: `project-${project.id}`,
      sourceType: 'project',
      sourceId: project.id,
      summary: `Project ${project.projectName} is ${project.status} with budget ${money(project.budget)} and ${project.milestones.length} milestones.`,
      similarityScore: null,
      relatedProjectId: project.id,
    });

    for (const milestone of project.milestones) {
      chunks.push({
        id: `milestone-${milestone.id}`,
        sourceType: 'milestone',
        sourceId: milestone.id,
        summary: `Milestone ${milestone.milestoneName} is ${milestone.status} and due ${dateLabel(milestone.dueDate)}.`,
        similarityScore: null,
        relatedProjectId: project.id,
      });
    }

    for (const invoice of project.invoices) {
      chunks.push({
        id: `invoice-${invoice.id}`,
        sourceType: 'invoice',
        sourceId: invoice.id,
        summary: `Invoice ${invoice.invoiceNumber ?? invoice.id.slice(0, 8)} is ${invoice.status} with outstanding ${money(invoice.outstandingAmount)} due ${dateLabel(invoice.dueDate)}.`,
        similarityScore: null,
        relatedProjectId: project.id,
      });
    }

    for (const payment of project.payments) {
      chunks.push({
        id: `payment-${payment.id}`,
        sourceType: 'payment',
        sourceId: payment.id,
        summary: `Payment ${payment.referenceNumber} of ${money(payment.amount)} was recorded on ${dateLabel(payment.paymentDate)}.`,
        similarityScore: null,
        relatedProjectId: project.id,
      });
    }

    for (const expense of project.expenses) {
      chunks.push({
        id: `expense-${expense.id}`,
        sourceType: 'expense',
        sourceId: expense.id,
        summary: `Expense entry of ${money(expense.amount)} was recorded on ${dateLabel(expense.createdAt)}.`,
        similarityScore: null,
        relatedProjectId: project.id,
      });
    }

    return chunks.sort((left, right) => left.sourceType.localeCompare(right.sourceType));
  }

  private buildRuleBasedPrediction(
    project: NonNullable<ProjectForecastRecord> & {
      payments: Awaited<
        ReturnType<AnalyticsRepository['findPaymentsForRiskForecast']>
      >;
    },
    retrievedChunks: RetrievedChunkDto[],
    warnings: string[],
    futureAdaptations: string[],
  ): AiRiskPredictionResponseDto {
    const overdueInvoices = project.invoices.filter(
      (invoice) => invoice.status === InvoiceStatus.OVERDUE,
    ).length;
    const incompleteMilestones = project.milestones.filter(
      (milestone) => milestone.status !== MilestoneStatus.COMPLETED,
    ).length;
    const lateMilestones = project.milestones.filter(
      (milestone) =>
        milestone.status !== MilestoneStatus.COMPLETED &&
        milestone.dueDate &&
        milestone.dueDate.getTime() < Date.now(),
    ).length;
    const totalInvoiced = sumMoney(project.invoices.map((invoice) => invoice.totalAmount));
    const totalOutstanding = sumMoney(
      project.invoices.map((invoice) => invoice.outstandingAmount),
    );
    const totalExpenses = project.expenses.reduce(
      (sum, expense) => sum + (expense.amount ?? 0),
      0,
    );
    const overdueRatio = project.invoices.length
      ? overdueInvoices / project.invoices.length
      : 0;
    const milestoneDelayRatio = project.milestones.length
      ? (lateMilestones + incompleteMilestones * 0.5) / project.milestones.length
      : 0;
    const paymentOutstandingRatio = totalInvoiced > 0 ? totalOutstanding / totalInvoiced : 0;
    const expensePressureRatio =
      project.budget && project.budget > 0 ? totalExpenses / project.budget : 0;

    const projectRiskScore = clamp01(
      overdueRatio * 0.35 +
        milestoneDelayRatio * 0.4 +
        expensePressureRatio * 0.25,
    );
    const paymentRiskScore = clamp01(
      overdueRatio * 0.6 + paymentOutstandingRatio * 0.4,
    );
    const milestoneRiskScore = clamp01(milestoneDelayRatio);

    return {
      projectId: project.id,
      projectName: project.projectName,
      projectRiskLevel: toRiskLevel(projectRiskScore),
      paymentDelayRisk: toRiskLevel(paymentRiskScore),
      milestoneDelayRisk: toRiskLevel(milestoneRiskScore),
      revenueTrend: toRevenueTrend(totalInvoiced, totalOutstanding, totalExpenses),
      explanation: [
        `${overdueInvoices} overdue invoices and ${lateMilestones} late milestones were found for this project.`,
        `Outstanding receivables are ${money(totalOutstanding)} out of ${money(totalInvoiced)} invoiced.`,
        `Recorded expenses total ${money(totalExpenses)} against a budget of ${money(project.budget)}.`,
      ].join(' '),
      recommendedAction: buildRecommendedAction(
        overdueInvoices,
        lateMilestones,
        paymentOutstandingRatio,
      ),
      predictionSource: PredictionSourceDto.RULE_BASED,
      sufficientData: true,
      confidenceScore: clamp01(
        0.45 +
          Math.min(retrievedChunks.length, 5) * 0.08 +
          Math.min(project.milestones.length, 4) * 0.03,
      ),
      context: {
        projectId: project.id,
        projectName: project.projectName,
        projectStatus: project.status,
        milestoneCount: project.milestones.length,
        completedMilestoneCount: project.milestones.filter(
          (milestone) => milestone.status === MilestoneStatus.COMPLETED,
        ).length,
        invoiceCount: project.invoices.length,
        overdueInvoiceCount: overdueInvoices,
        paymentCount: project.payments.length,
        expenseCount: project.expenses.length,
        retrievedChunks,
      },
      warnings,
      futureAdaptations,
      generatedAt: new Date().toISOString(),
    };
  }

  private hasEnoughData(
    project: NonNullable<ProjectForecastRecord> & {
      payments: Awaited<
        ReturnType<AnalyticsRepository['findPaymentsForRiskForecast']>
      >;
    },
    retrievedChunks: RetrievedChunkDto[],
  ) {
    return (
      retrievedChunks.length >= 3 &&
      project.milestones.length + project.invoices.length + project.expenses.length >= 3
    );
  }

  private isVectorSearchEnabled() {
    return (
      this.configService.get<string>('AI_VECTOR_SEARCH_ENABLED') === 'true' ||
      this.configService.get<string>('RAG_VECTOR_TABLE')
    );
  }

  private futureAdaptations() {
    return [
      'Create a Neon pgvector knowledge-chunk table and embed project history into it.',
      'Replace relational fallback retrieval with vector similarity search over project, milestone, invoice, payment, and expense chunks.',
      'Add an ingestion job so embeddings stay current after finance and project events.',
      'Tune prompts and response schema once an approved AI provider is connected.',
    ];
  }

  private async requestProviderPrediction(
    project: NonNullable<ProjectForecastRecord> & {
      payments: Awaited<
        ReturnType<AnalyticsRepository['findPaymentsForRiskForecast']>
      >;
    },
    retrievedChunks: RetrievedChunkDto[],
  ): Promise<AiProviderPredictionResponseDto | null> {
    const provider = this.configService.get<string>('AI_PROVIDER');
    const apiKey = this.configService.get<string>('AI_API_KEY');
    const model = this.configService.get<string>('AI_MODEL') ?? 'gpt-4o-mini';

    if (!provider || !apiKey || provider.toLowerCase() !== 'openai') {
      return null;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a construction project risk predictor. Return compact JSON only.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              projectId: project.id,
              projectName: project.projectName,
              status: project.status,
              milestones: project.milestones.length,
              invoices: project.invoices.length,
              payments: project.payments.length,
              expenses: project.expenses.length,
              retrievedChunks: retrievedChunks.map((chunk) => ({
                sourceType: chunk.sourceType,
                sourceId: chunk.sourceId,
                summary: chunk.summary,
              })),
              requiredFields: [
                'projectRiskLevel',
                'paymentDelayRisk',
                'milestoneDelayRisk',
                'revenueTrend',
                'explanation',
                'recommendedAction',
                'confidenceScore',
              ],
              allowedRiskLevels: Object.values(RiskLevelDto),
              allowedRevenueTrends: Object.values(RevenueTrendDto),
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI provider returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new InternalServerErrorException({
        code: 'AI_PROVIDER_EMPTY_RESPONSE',
        message: 'AI provider returned an empty completion.',
      });
    }

    return JSON.parse(content) as AiProviderPredictionResponseDto;
  }
}

function toRiskLevel(score: number): RiskLevelDto {
  if (score >= 0.67) return RiskLevelDto.HIGH;
  if (score >= 0.34) return RiskLevelDto.MEDIUM;
  return RiskLevelDto.LOW;
}

function toRevenueTrend(
  totalInvoiced: number,
  totalOutstanding: number,
  totalExpenses: number,
): RevenueTrendDto {
  const realizedRevenue = totalInvoiced - totalOutstanding;
  if (realizedRevenue > totalExpenses * 1.2) return RevenueTrendDto.GROWING;
  if (realizedRevenue < totalExpenses * 0.9) return RevenueTrendDto.DECLINING;
  return RevenueTrendDto.STABLE;
}

function buildRecommendedAction(
  overdueInvoices: number,
  lateMilestones: number,
  paymentOutstandingRatio: number,
) {
  if (lateMilestones > 0) {
    return 'Review the milestone schedule, unblock delayed work packages, and rebalance task ownership this week.';
  }
  if (overdueInvoices > 0 || paymentOutstandingRatio >= 0.35) {
    return 'Prioritize client payment follow-up and align invoice reminders with the finance team.';
  }
  return 'Keep monitoring milestone completion and receivables while adding more historical records for stronger predictions.';
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function dateLabel(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : 'not scheduled';
}

function sumMoney(
  values: Array<{ toNumber(): number } | number | null | undefined>,
) {
  return values.reduce<number>((sum, value) => sum + money(value), 0);
}

function money(value: { toNumber(): number } | number | null | undefined) {
  if (typeof value === 'number') return Math.round(value * 100) / 100;
  if (value && 'toNumber' in value) return Math.round(value.toNumber() * 100) / 100;
  return 0;
}
