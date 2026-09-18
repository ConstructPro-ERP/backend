import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, Observable } from 'rxjs';
import { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { ApproveQuotationDto } from '../../../quotation-service/src/dto/approve-quotation.dto';

const QUOTATION_SERVICE_URL =
  process.env.QUOTATION_SERVICE_URL ?? 'http://localhost:4009';

interface DownstreamError {
  statusCode?: number;
  code?: string;
  message?: string;
  details?: unknown;
}

interface AxiosErrorShape {
  response?: {
    status?: number;
    data?: DownstreamError;
  };
}

@Controller('quotations')
export class QuotationsGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SALES_MANAGER', 'ADMIN')
  async create(@Body() body: unknown, @Req() req: Request): Promise<unknown> {
    return this.forward(() =>
      this.httpService.post(`${QUOTATION_SERVICE_URL}/quotations`, body, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SALES_MANAGER', 'ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.forward(() =>
      this.httpService.get(`${QUOTATION_SERVICE_URL}/quotations/${id}`, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async approveAndConvert(
    @Param('id') id: string,
    @Body() body: ApproveQuotationDto,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.forward(() =>
      this.httpService.patch(
        `${QUOTATION_SERVICE_URL}/quotations/${id}/approve`,
        body,
        { headers: { authorization: req.headers.authorization } },
      ),
    );
  }

  private async forward(
    call: () => Observable<AxiosResponse<unknown>>,
  ): Promise<unknown> {
    try {
      const resp = await firstValueFrom(call());
      return resp.data;
    } catch (err: unknown) {
      const axiosErr = err as AxiosErrorShape;
      const status = axiosErr?.response?.status;
      const downstream = axiosErr?.response?.data;
      if (status && downstream) {
        throw new HttpException(
          {
            code: downstream.code ?? 'INTERNAL_ERROR',
            message: downstream.message ?? 'Something went wrong.',
            details: downstream.details,
          },
          status,
        );
      }
      throw new HttpException(
        {
          code: 'INTERNAL_ERROR',
          message: 'Quotation service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
