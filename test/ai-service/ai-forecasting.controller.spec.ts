import { AiForecastingController } from '../../apps/ai-service/src/ai-forecasting.controller';
import { AiForecastingService } from '../../apps/ai-service/src/ai-forecasting.service';

describe('AiForecastingController', () => {
  const aiForecastingService = {
    predictProjectRisk: jest.fn(),
  };

  let controller: AiForecastingController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AiForecastingController(
      aiForecastingService as unknown as AiForecastingService,
    );
  });

  it('delegates project risk lookups to the forecasting service', async () => {
    const response = { projectId: '5a9d2de1-6c25-4bc0-ad37-faf5dd6eaf77' };
    aiForecastingService.predictProjectRisk.mockResolvedValue(response);

    await expect(
      controller.projectRisk({
        projectId: '5a9d2de1-6c25-4bc0-ad37-faf5dd6eaf77',
      }),
    ).resolves.toBe(response);

    expect(aiForecastingService.predictProjectRisk).toHaveBeenCalledWith(
      '5a9d2de1-6c25-4bc0-ad37-faf5dd6eaf77',
    );
  });
});
