import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
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
import { KpiQueryDto } from '../../../analytics-service/src/dto/kpi-query.dto';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const ANALYTICS_ROLES = ['ADMIN', 'MANAGEMENT', 'FINANCE', 'ACCOUNTANT'];

interface DownstreamError {
  code?: string;
  message?: string;
  details?: unknown;
}

interface AxiosErrorShape {
  response?: { status?: number; data?: DownstreamError };
}

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ANALYTICS_ROLES)
@Controller('analytics')
export class AnalyticsGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Get('kpis/revenue')
  @ApiOperation({ summary: 'Get revenue KPI cards' })
  @ApiOkResponse({ description: 'Revenue dashboard metrics' })
  revenue(@Query() query: KpiQueryDto, @Req() req: Request) {
    return this.forward(() =>
      this.httpService.get(this.url('/analytics/kpis/revenue'), {
        headers: this.forwardHeaders(req),
        params: query,
      }),
    );
  }

  @Get('kpis/projects')
  @ApiOperation({ summary: 'Get project KPI cards' })
  projects(@Query() query: KpiQueryDto, @Req() req: Request) {
    return this.forward(() =>
      this.httpService.get(this.url('/analytics/kpis/projects'), {
        headers: this.forwardHeaders(req),
        params: query,
      }),
    );
  }

  @Get('kpis/invoices')
  @ApiOperation({ summary: 'Get invoice KPI cards' })
  invoices(@Query() query: KpiQueryDto, @Req() req: Request) {
    return this.forward(() =>
      this.httpService.get(this.url('/analytics/kpis/invoices'), {
        headers: this.forwardHeaders(req),
        params: query,
      }),
    );
  }

  @Get('kpis/sales')
  @ApiOperation({ summary: 'Get sales KPI cards' })
  sales(@Query() query: KpiQueryDto, @Req() req: Request) {
    return this.forward(() =>
      this.httpService.get(this.url('/analytics/kpis/sales'), {
        headers: this.forwardHeaders(req),
        params: query,
      }),
    );
  }

  @Get('dashboard/summary')
  @ApiOperation({ summary: 'Get all dashboard KPI cards in one payload' })
  summary(@Query() query: KpiQueryDto, @Req() req: Request) {
    return this.forward(() =>
      this.httpService.get(this.url('/analytics/dashboard/summary'), {
        headers: this.forwardHeaders(req),
        params: query,
      }),
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
          code: 'ANALYTICS_SERVICE_UNAVAILABLE',
          message: 'Analytics service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
