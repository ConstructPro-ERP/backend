import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';

const QUOTATION_SERVICE_URL =
  process.env.QUOTATION_SERVICE_URL ?? 'http://localhost:3009';

interface DownstreamError {
  statusCode?: number;
  code?: string;
  message?: string;
  details?: unknown;
}

@Controller('quotations')
export class QuotationsGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Sales Manager', 'Admin')
  async create(@Body() body: unknown, @Req() req: Request) {
    return this.forward(() =>
      this.httpService.post(`${QUOTATION_SERVICE_URL}/quotations`, body, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Sales Manager', 'Admin', 'Project Manager', 'Accountant')
  async findOne(@Param('id') id: string, @Req() req: Request) {
    return this.forward(() =>
      this.httpService.get(`${QUOTATION_SERVICE_URL}/quotations/${id}`, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  private async forward(call: () => any) {
    try {
      const resp = await firstValueFrom<AxiosResponse>(call());
      return resp.data;
    } catch (err: any) {
      const status = err?.response?.status;
      const downstream = err?.response?.data as DownstreamError | undefined;
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
        { code: 'INTERNAL_ERROR', message: 'Quotation service is unreachable.' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
