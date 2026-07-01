import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosResponse } from 'axios';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { firstValueFrom, type Observable } from 'rxjs';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL ?? 'http://localhost:3333';

interface DownstreamError {
  statusCode?: number;
  code?: string;
  message?: string;
  details?: string[];
}

type DownstreamSuccess<T = unknown> = AxiosResponse<T>;

class LoginDto {
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;
}

class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  roleId!: string;
}

class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

@Controller('auth')
export class AuthGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<unknown> {
    return this.forwardRequest(() =>
      this.httpService.post(`${AUTH_SERVICE_URL}/auth/login`, dto),
    );
  }

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<unknown> {
    return this.forwardRequest(() =>
      this.httpService.post(`${AUTH_SERVICE_URL}/auth/register`, dto),
    );
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto): Promise<unknown> {
    return this.forwardRequest(() =>
      this.httpService.post(`${AUTH_SERVICE_URL}/auth/refresh`, dto),
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request): Promise<unknown> {
    return this.forwardRequest(() =>
      this.httpService.get(`${AUTH_SERVICE_URL}/auth/me`, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  private async forwardRequest<T>(
    call: () => Observable<DownstreamSuccess<T>>,
  ) {
    try {
      const response = await firstValueFrom(call());
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<DownstreamError>;
      const status = axiosError.response?.status;
      const downstream = axiosError.response?.data;

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
        { code: 'INTERNAL_ERROR', message: 'Auth service is unreachable.' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
  // @Get('google')
  // googleLogin(@Res() res: import('express').Response) {
  //   // Redirect browser directly to auth-service Google initiation URL
  //   res.redirect(`${AUTH_SERVICE_URL}/auth/google`);
  // }
  //
  // @Get('google/callback')
  // googleCallback(@Req() req: Request, @Res() res: import('express').Response) {
  //   // auth-service handles the callback and redirects to frontend;
  //   // gateway just passes the request through transparently
  //   res.redirect(
  //     `${AUTH_SERVICE_URL}/auth/google/callback?${new URLSearchParams(req.query as any).toString()}`,
  //   );
  // }
}
