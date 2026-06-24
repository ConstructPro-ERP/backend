import { ConfigService } from '@nestjs/config';
import { AiProviderService } from './ai-provider.service';
import { RevenueTrendDto, RiskLevelDto } from './dto/ai-forecasting.dto';

describe('AiProviderService', () => {
  let service: AiProviderService;
  const configService = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiProviderService(
      configService as unknown as ConfigService,
    );
  });

  it('returns null when provider is not configured for OpenRouter', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'AI_PROVIDER') return 'openai';
      return undefined;
    });

    await expect(
      service.predictViaProvider({ systemPrompt: 's', userPrompt: 'u' }),
    ).resolves.toBeNull();
  });

  it('parses a valid OpenRouter JSON response', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'AI_PROVIDER') return 'openrouter';
      if (key === 'AI_API_KEY') return 'test-key';
      if (key === 'AI_MODEL') return 'openrouter/free';
      if (key === 'OPENROUTER_HTTP_REFERER') return 'https://constructpro.test';
      if (key === 'OPENROUTER_APP_TITLE') return 'ConstructPro';
      return undefined;
    });

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  projectRiskLevel: RiskLevelDto.HIGH,
                  paymentDelayRisk: RiskLevelDto.MEDIUM,
                  milestoneDelayRisk: RiskLevelDto.HIGH,
                  revenueTrend: RevenueTrendDto.STABLE,
                  explanation: 'High schedule pressure',
                  recommendedAction: 'Replan the next milestone',
                  confidenceScore: 0.84,
                }),
              },
            },
          ],
        }),
      } as Response);

    const result = await service.predictViaProvider({
      systemPrompt: 'system',
      userPrompt: 'user',
    });

    expect(result).toMatchObject({
      projectRiskLevel: RiskLevelDto.HIGH,
      recommendedAction: 'Replan the next milestone',
      confidenceScore: 0.84,
    });
    fetchSpy.mockRestore();
  });
});
