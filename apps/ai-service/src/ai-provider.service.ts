import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProviderPredictionResponseDto,
  RevenueTrendDto,
  RiskLevelDto,
} from './dto/ai-forecasting.dto';

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.configService.get<string>('AI_PROVIDER') &&
        this.configService.get<string>('AI_API_KEY'),
    );
  }

  async predictViaProvider(args: {
    systemPrompt: string;
    userPrompt: string;
  }): Promise<AiProviderPredictionResponseDto | null> {
    const provider = this.configService.get<string>('AI_PROVIDER');
    if (!provider || provider.toLowerCase() !== 'openrouter') {
      return null;
    }

    const apiKey = this.configService.get<string>('AI_API_KEY');
    if (!apiKey) return null;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'HTTP-Referer':
          this.configService.get<string>('OPENROUTER_HTTP_REFERER') ??
          'https://constructpro.local',
        'X-OpenRouter-Title':
          this.configService.get<string>('OPENROUTER_APP_TITLE') ??
          'ConstructPro Analytics',
      },
      body: JSON.stringify({
        model: this.configService.get<string>('AI_MODEL') ?? 'openrouter/free',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: args.systemPrompt },
          { role: 'user', content: args.userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      this.logger.warn(`OpenRouter returned ${response.status} for AI prediction.`);
      throw new Error(`OpenRouter provider returned ${response.status}`);
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

    return parseProviderPrediction(content);
  }
}

function parseProviderPrediction(content: string): AiProviderPredictionResponseDto {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('AI provider returned invalid JSON.');
  }

  const candidate = parsed as Partial<AiProviderPredictionResponseDto>;
  if (
    !isRiskLevel(candidate.projectRiskLevel) ||
    !isRiskLevel(candidate.paymentDelayRisk) ||
    !isRiskLevel(candidate.milestoneDelayRisk) ||
    !isRevenueTrend(candidate.revenueTrend) ||
    typeof candidate.explanation !== 'string' ||
    typeof candidate.recommendedAction !== 'string' ||
    typeof candidate.confidenceScore !== 'number'
  ) {
    throw new Error('AI provider returned an invalid prediction schema.');
  }

  return {
    projectRiskLevel: candidate.projectRiskLevel,
    paymentDelayRisk: candidate.paymentDelayRisk,
    milestoneDelayRisk: candidate.milestoneDelayRisk,
    revenueTrend: candidate.revenueTrend,
    explanation: candidate.explanation,
    recommendedAction: candidate.recommendedAction,
    confidenceScore: clamp01(candidate.confidenceScore),
    warnings:
      Array.isArray(candidate.warnings) &&
      candidate.warnings.every((item) => typeof item === 'string')
        ? candidate.warnings
        : undefined,
  };
}

function isRiskLevel(value: unknown): value is RiskLevelDto {
  return typeof value === 'string' && Object.values(RiskLevelDto).includes(value as RiskLevelDto);
}

function isRevenueTrend(value: unknown): value is RevenueTrendDto {
  return (
    typeof value === 'string' &&
    Object.values(RevenueTrendDto).includes(value as RevenueTrendDto)
  );
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}
