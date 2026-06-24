import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, Observable } from 'rxjs';
import { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';

const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL ?? 'http://localhost:3334';

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

@Controller('users')
export class UsersGatewayController {
  constructor(private readonly httpService: HttpService) {}

  /**
   * GET /users
   * Admin-only: list all users.
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async findAll(@Req() req: Request): Promise<unknown> {
    return this.forward(() =>
      this.httpService.get(`${USER_SERVICE_URL}/users`, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  /**
   * POST /users
   * Admin-only: create a new user.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async create(@Body() body: unknown, @Req() req: Request): Promise<unknown> {
    return this.forward(() =>
      this.httpService.post(`${USER_SERVICE_URL}/users`, body, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  /**
   * GET /users/:id
   * Admin or the user themselves can fetch a profile.
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SALES_MANAGER', 'PROJECT_MANAGER', 'ACCOUNTANT')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.forward(() =>
      this.httpService.get(`${USER_SERVICE_URL}/users/${id}`, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  /**
   * PATCH /users/:id
   * Admin-only: update user fields (role, status, email, etc.).
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.forward(() =>
      this.httpService.patch(`${USER_SERVICE_URL}/users/${id}`, body, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  /**
   * PATCH /users/:id/profile
   * Any authenticated user: update their own profile (name, avatar only).
   */
  @Patch(':id/profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.forward(() =>
      this.httpService.patch(`${USER_SERVICE_URL}/users/${id}/profile`, body, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  /**
   * DELETE /users/:id
   * Admin-only: deactivate (soft-delete) a user.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async remove(@Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.forward(() =>
      this.httpService.delete(`${USER_SERVICE_URL}/users/${id}`, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

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
          message: 'User service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
