import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProviderPredictionChunkDto,
  RetrievedChunkDto,
  RevenueTrendDto,
  RiskLevelDto,
} from './dto/ai-forecasting.dto';

type PromptPayload = {
  systemPrompt: string;
  userPrompt: string;
  warnings: string[];
  chunks: AiProviderPredictionChunkDto[];
};

@Injectable()
export class AiPromptService {
  constructor(private readonly configService: ConfigService) {}

  buildRiskPredictionPrompt(args: {
    projectId: string;
    projectName: string;
    projectStatus: string;
    retrievedChunks: RetrievedChunkDto[];
    paymentCount: number;
    milestoneCount: number;
    invoiceCount: number;
    expenseCount: number;
  }): PromptPayload {
    const warnings: string[] = [];
    const maxChunks = Math.max(
      1,
      Number.parseInt(
        this.configService.get<string>('AI_MAX_CONTEXT_CHUNKS') ??
          this.configService.get<string>('RAG_TOP_K') ??
          '5',
        10,
      ) || 5,
    );
    const maxPromptTokens = Math.max(
      500,
      Number.parseInt(
        this.configService.get<string>('AI_MAX_PROMPT_TOKENS') ?? '4000',
        10,
      ) || 4000,
    );
    const maxPromptChars = maxPromptTokens * 4;

    const chunks = args.retrievedChunks.slice(0, maxChunks).map((chunk) => ({
      id: chunk.id,
      sourceType: chunk.sourceType,
      sourceId: sanitizeIdentifier(chunk.sourceId),
      summary: sanitizeChunkSummary(chunk.summary),
    }));

    if (args.retrievedChunks.length > chunks.length) {
      warnings.push(
        `Prompt context was limited to ${chunks.length} chunks by AI_MAX_CONTEXT_CHUNKS.`,
      );
    }

    const systemPrompt =
      'You are a construction project risk forecasting assistant. Return strict JSON only. Do not include markdown. Do not include extra keys.';

    const payload = {
      project: {
        projectId: sanitizeIdentifier(args.projectId),
        projectName: args.projectName,
        projectStatus: args.projectStatus,
      },
      contextCounts: {
        paymentCount: args.paymentCount,
        milestoneCount: args.milestoneCount,
        invoiceCount: args.invoiceCount,
        expenseCount: args.expenseCount,
      },
      chunks,
      instructions: {
        task: 'Predict project risk using the provided RAG context.',
        returnFields: [
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
        confidenceScoreRange: [0, 1],
        confidentialityRules: [
          'Do not infer or expose passwords, tokens, audit data, or personal user data.',
          'Use only the sanitized context provided in this prompt.',
          'Do not mention raw internal IDs unless necessary.',
        ],
      },
    };

    let userPrompt = JSON.stringify(payload);
    if (userPrompt.length > maxPromptChars) {
      warnings.push(
        `Prompt content was truncated to respect AI_MAX_PROMPT_TOKENS=${maxPromptTokens}.`,
      );
      userPrompt = userPrompt.slice(0, maxPromptChars);
    }

    return {
      systemPrompt,
      userPrompt,
      warnings,
      chunks,
    };
  }
}

function sanitizeIdentifier(value: string | null | undefined) {
  if (!value) return null;
  return value.length <= 8 ? value : `${value.slice(0, 8)}...`;
}

function sanitizeChunkSummary(summary: string) {
  return summary
    .replace(/\b[A-Z]{3,}-\d+\b/g, '[reference]')
    .replace(/\bPAY-\d+\b/gi, '[payment-reference]')
    .replace(/\bINV-\d+\b/gi, '[invoice-reference]');
}
