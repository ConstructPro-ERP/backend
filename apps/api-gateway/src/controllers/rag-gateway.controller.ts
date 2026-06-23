import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
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
  RagIndexingSummaryDto,
  RagReindexPathDto,
  RagRetrievalResponseDto,
  RagRetrieveQueryDto,
} from '../../../analytics-service/src/dto/rag.dto';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const RAG_ROLES = ['ADMIN', 'MANAGEMENT', 'FINANCE', 'ACCOUNTANT'];

interface DownstreamError {
  code?: string;
  message?: string;
  details?: unknown;
}

interface AxiosErrorShape {
  response?: { status?: number; data?: DownstreamError };
}

@ApiTags('RAG')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...RAG_ROLES)
@Controller('ai-forecasting/rag')
export class RagGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post('projects/:projectId/reindex')
  @ApiOperation({ summary: 'Trigger project RAG indexing' })
  @ApiOkResponse({ type: RagIndexingSummaryDto })
  reindex(@Param() params: RagReindexPathDto, @Req() req: Request) {
    return this.forward(() =>
      this.httpService.post(
        this.url(`/analytics/ai-forecasting/rag/projects/${params.projectId}/reindex`),
        undefined,
        {
          headers: this.forwardHeaders(req),
        },
      ),
    );
  }

  @Get('projects/:projectId/chunks')
  @ApiOperation({ summary: 'Retrieve project RAG chunks' })
  @ApiOkResponse({ type: RagRetrievalResponseDto })
  retrieve(
    @Param() params: RagReindexPathDto,
    @Query() query: RagRetrieveQueryDto,
    @Req() req: Request,
  ) {
    return this.forward(() =>
      this.httpService.get(
        this.url(`/analytics/ai-forecasting/rag/projects/${params.projectId}/chunks`),
        {
          headers: this.forwardHeaders(req),
          params: query,
        },
      ),
    );
  }

  private url(path: string): string {
    const base = process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:4011';
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
          code: 'RAG_SERVICE_UNAVAILABLE',
          message: 'RAG service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
