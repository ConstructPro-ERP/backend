import { ConfigService } from '@nestjs/config';
import { AiProviderService } from '../../apps/ai-service/src/ai-provider.service';
import {
  RevenueTrendDto,
  RiskLevelDto,
} from '../../apps/ai-service/src/dto/ai-forecasting.dto';

describe('AiProviderService', () => {
  let service: AiProviderService;
  const configService = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AiProviderService(configService as unknown as ConfigService);
  });

  afterEach(() => jest.restoreAllMocks());

  const prompts = { systemPrompt: 'system', userPrompt: 'user' };
  const valid = {
    projectRiskLevel: 'LOW',
    paymentDelayRisk: 'MEDIUM',
    milestoneDelayRisk: 'HIGH',
    revenueTrend: 'STABLE',
    explanation: 'Schedule pressure',
    recommendedAction: 'Review milestones',
    confidenceScore: 0.84,
  };
  function completion(content: string) {
    return {
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content } }] }),
    } as Response;
  }
  function configure() {
    configService.get.mockImplementation((key: string) =>
      key === 'AI_API_KEY' ? 'test-key' : undefined,
    );
  }

  it('does not call the provider without credentials', async () => {
    const fetch = jest.spyOn(global, 'fetch');
    await expect(service.predictViaProvider(prompts)).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    {},
    { ...valid, projectRiskLevel: 'UNKNOWN' },
    { ...valid, paymentDelayRisk: 3 },
    { ...valid, milestoneDelayRisk: null },
    { ...valid, revenueTrend: 'UNKNOWN' },
    { ...valid, explanation: 1 },
    { ...valid, recommendedAction: null },
    { ...valid, confidenceScore: '0.5' },
  ])('rejects malformed prediction %j', async (prediction) => {
    configure();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(completion(JSON.stringify(prediction)));
    await expect(service.predictViaProvider(prompts)).rejects.toThrow(
      'invalid prediction schema',
    );
  });

  it('rejects non-finite confidence parsed from provider JSON', async () => {
    configure();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        completion(JSON.stringify(valid).replace('0.84', '1e400')),
      );
    await expect(service.predictViaProvider(prompts)).rejects.toThrow(
      'invalid prediction schema',
    );
  });

  it.each([{}, { choices: [] }, { choices: [{ message: {} }] }])(
    'rejects empty completions %j',
    async (payload) => {
      configure();
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
      } as Response);
      await expect(service.predictViaProvider(prompts)).rejects.toThrow(
        'empty completion',
      );
    },
  );

  it('propagates unavailable-provider and network errors', async () => {
    configure();
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(service.predictViaProvider(prompts)).rejects.toThrow('503');
    fetch.mockRejectedValue(new Error('network unavailable'));
    await expect(service.predictViaProvider(prompts)).rejects.toThrow(
      'network unavailable',
    );
  });

  it.each([-0.3, 1.5])(
    'clamps confidence %s and preserves valid warnings',
    async (confidenceScore) => {
      configure();
      jest.spyOn(global, 'fetch').mockResolvedValue(
        completion(
          JSON.stringify({
            ...valid,
            confidenceScore,
            warnings: ['Review data'],
          }),
        ),
      );
      await expect(service.predictViaProvider(prompts)).resolves.toMatchObject({
        confidenceScore: Math.max(0, Math.min(1, confidenceScore)),
        warnings: ['Review data'],
      });
    },
  );

  it('discards warnings containing non-string values', async () => {
    configure();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        completion(JSON.stringify({ ...valid, warnings: [123] })),
      );
    expect(
      (await service.predictViaProvider(prompts))?.warnings,
    ).toBeUndefined();
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

  it('reports whether the provider is configured', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'AI_PROVIDER') return 'openrouter';
      if (key === 'AI_API_KEY') return 'test-key';
      return undefined;
    });

    expect(service.isConfigured()).toBe(true);
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

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
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

  it('throws when the provider returns invalid JSON content', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'AI_PROVIDER') return 'openrouter';
      if (key === 'AI_API_KEY') return 'test-key';
      return undefined;
    });

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'not-json' } }],
        }),
    } as Response);

    await expect(
      service.predictViaProvider({
        systemPrompt: 'system',
        userPrompt: 'user',
      }),
    ).rejects.toThrow('AI provider returned invalid JSON.');

    fetchSpy.mockRestore();
  });
});
