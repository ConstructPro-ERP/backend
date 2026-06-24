import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { firstValueFrom, Observable } from 'rxjs';
import {
  AiRiskPredictionPathDto,
  AiRiskPredictionResponseDto,
} from '../../../ai-service/src/dto/ai-forecasting.dto';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const AI_FORECASTING_ROLES = ['ADMIN', 'MANAGEMENT', 'FINANCE', 'ACCOUNTANT'];

interface DownstreamError {
  code?: string;
  message?: string;
  details?: unknown;
}

interface AxiosErrorShape {
  response?: { status?: number; data?: DownstreamError };
}

@ApiTags('AI Forecasting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_FORECASTING_ROLES)
@Controller('ai-forecasting')
export class AiForecastingGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Get('projects/:projectId/risk')
  @ApiOperation({
    summary: 'Get a project risk prediction through the analytics AI boundary',
  })
  @ApiOkResponse({ type: AiRiskPredictionResponseDto })
  projectRisk(@Param() params: AiRiskPredictionPathDto, @Req() req: Request) {
    return this.forward(() =>
      this.httpService.get(
        this.url(`/ai-forecasting/projects/${params.projectId}/risk`),
        {
          headers: this.forwardHeaders(req),
        },
      ),
    );
  }

  private url(path: string): string {
    const base = process.env.AI_SERVICE_URL ?? 'http://localhost:4012';
    return `${base}${path}`;
  }

  private forwardHeaders(req: Request) {
    return {
      authorization: req.headers.authorization,
    };
  }

  private async forward(
    call: () => Observable<AxiosResponse<unknown>>,
  ): Promise<unknown> {
    try {
      return (await firstValueFrom(call())).data;
    } catch (error: unknown) {
      const downstream = (error as AxiosErrorShape).response;
      if (downstream?.status && downstream.data) {
        throw new HttpException(downstream.data, downstream.status);
      }
      throw new HttpException(
        {
          code: 'AI_FORECASTING_SERVICE_UNAVAILABLE',
          message: 'AI forecasting service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
