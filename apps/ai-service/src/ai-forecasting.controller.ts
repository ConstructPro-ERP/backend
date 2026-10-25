import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AiForecastingService } from './ai-forecasting.service';
import {
  AiRiskPredictionPathDto,
  AiRiskPredictionResponseDto,
} from './dto/ai-forecasting.dto';

@ApiTags('AI Forecasting')
@ApiBearerAuth()
@Controller('ai-forecasting')
export class AiForecastingController {
  constructor(private readonly aiForecastingService: AiForecastingService) {}

  @Get('projects/:projectId/risk')
  @ApiOperation({
    summary:
      'Get a RAG-backed project risk prediction with safe fallback handling',
  })
  @ApiOkResponse({ type: AiRiskPredictionResponseDto })
  @ApiNotFoundResponse({ description: 'Project not found' })
  projectRisk(@Param() params: AiRiskPredictionPathDto) {
    return this.aiForecastingService.predictProjectRisk(params.projectId);
  }
}
