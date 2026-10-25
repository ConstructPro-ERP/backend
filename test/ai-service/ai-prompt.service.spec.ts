import { ConfigService } from '@nestjs/config';
import { AiPromptService } from '../../apps/ai-service/src/ai-prompt.service';

describe('AiPromptService', () => {
  const configService = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      if (key === 'AI_MAX_CONTEXT_CHUNKS') return '1';
      if (key === 'AI_MAX_PROMPT_TOKENS') return '1000';
      return undefined;
    });
  });

  it.each([undefined, 'invalid', '-1'])(
    'bounds prompt size with configuration %s',
    (setting) => {
      configService.get.mockImplementation(() => setting);
      const service = new AiPromptService(
        configService as unknown as ConfigService,
      );
      const result = service.buildRiskPredictionPrompt({
        projectId: 'short',
        projectName: 'Tower'.repeat(5000),
        projectStatus: 'ACTIVE',
        paymentCount: 0,
        milestoneCount: 0,
        invoiceCount: 0,
        expenseCount: 0,
        retrievedChunks: [
          {
            id: 'chunk-1',
            sourceType: 'project',
            sourceId: null,
            summary: 'Project context',
            relatedProjectId: 'short',
            similarityScore: null,
          },
        ],
      });
      expect(result.userPrompt.length).toBeLessThanOrEqual(
        setting === '-1' ? 2000 : 16000,
      );
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('truncated')]),
      );
      expect(result.chunks[0].sourceId).toBeNull();
    },
  );

  it('limits context chunks and sanitizes identifiers', () => {
    const service = new AiPromptService(
      configService as unknown as ConfigService,
    );

    const result = service.buildRiskPredictionPrompt({
      projectId: '4d2d9cd8-9772-4ab0-a55a-504cb9c5e4e9',
      projectName: 'Tower A',
      projectStatus: 'ACTIVE',
      paymentCount: 1,
      milestoneCount: 2,
      invoiceCount: 1,
      expenseCount: 1,
      retrievedChunks: [
        {
          id: 'chunk-1',
          sourceType: 'invoice',
          sourceId: 'INV-001-SECRET',
          summary: 'Invoice INV-001 is overdue.',
          similarityScore: null,
          relatedProjectId: 'proj-1',
        },
        {
          id: 'chunk-2',
          sourceType: 'payment',
          sourceId: 'PAY-001-SECRET',
          summary: 'Payment PAY-001 was recorded.',
          similarityScore: null,
          relatedProjectId: 'proj-1',
        },
      ],
    });

    expect(result.chunks).toHaveLength(1);
    expect(result.warnings[0]).toContain('AI_MAX_CONTEXT_CHUNKS');
    expect(result.userPrompt).toContain('[reference]');
    expect(result.userPrompt).not.toContain('PAY-001-SECRET');
  });
});
