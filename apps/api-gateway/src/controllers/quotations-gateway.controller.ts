import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Body,
  Param,
  Query,
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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SALES_MANAGER', 'ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT')
  async findAll(
    @Query() query: unknown,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.forward(() =>
      this.httpService.get(`${QUOTATION_SERVICE_URL}/quotations`, {
        headers: { authorization: req.headers.authorization },
        params: query,
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

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SALES_MANAGER', 'ADMIN')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.forward(() =>
      this.httpService.put(`${QUOTATION_SERVICE_URL}/quotations/${id}`, body, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SALES_MANAGER', 'ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT')
  async getPdf(@Param('id') id: string, @Req() req: Request): Promise<unknown> {
    return this.forward(() =>
      this.httpService.get(`${QUOTATION_SERVICE_URL}/quotations/${id}/pdf`, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SALES_MANAGER', 'ADMIN')
  async reject(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.forward(() =>
      this.httpService.patch(
        `${QUOTATION_SERVICE_URL}/quotations/${id}/reject`,
        body,
        { headers: { authorization: req.headers.authorization } },
      ),
    );
  }

  @Patch(':id/revise')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SALES_MANAGER', 'ADMIN')
  async revise(@Param('id') id: string, @Req() req: Request): Promise<unknown> {
    return this.forward(() =>
      this.httpService.patch(
        `${QUOTATION_SERVICE_URL}/quotations/${id}/revise`,
        {},
        { headers: { authorization: req.headers.authorization } },
      ),
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

  @Patch(':id/direct-approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SALES_MANAGER', 'ADMIN')
  async directApprove(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.forward(() =>
      this.httpService.patch(
        `${QUOTATION_SERVICE_URL}/quotations/${id}/direct-approve`,
        {},
        { headers: { authorization: req.headers.authorization } },
      ),
    );
  }

  @Patch(':id/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SALES_MANAGER', 'ADMIN')
  async submit(@Param('id') id: string, @Req() req: Request): Promise<unknown> {
    return this.forward(() =>
      this.httpService.patch(
        `${QUOTATION_SERVICE_URL}/quotations/${id}/submit`,
        {},
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
