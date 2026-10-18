import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
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
  @Get('roles')
  async roles(): Promise<unknown> {
    return this.forwardRequest(() => {
      return this.httpService.get(`${AUTH_SERVICE_URL}/auth/roles`);
    });
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
  @Get('google')
  googleLogin(@Res() res: import('express').Response) {
    return this.forwardOAuth('/auth/google', res);
  }

  @Get('google/callback')
  googleCallback(@Req() req: Request, @Res() res: import('express').Response) {
    // Preserve Google's encoded parameters without sending the browser downstream.
    const queryIndex = req.originalUrl.indexOf('?');
    const queryString =
      queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';

    return this.forwardOAuth(`/auth/google/callback${queryString}`, res);
  }

  private async forwardOAuth(path: string, res: import('express').Response) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${AUTH_SERVICE_URL}${path}`, {
          // Return the Location header instead of following Google or the frontend.
          maxRedirects: 0,
          timeout: 15000,
          validateStatus: (status) => status >= 200 && status < 400,
        }),
      );
      const location: unknown = response.headers.location;
      if (
        ![302, 303, 307, 308].includes(response.status) ||
        typeof location !== 'string'
      ) {
        throw new Error('Expected an OAuth redirect');
      }
      const destination = new URL(location);
      const expectedOrigin =
        path === '/auth/google'
          ? 'https://accounts.google.com'
          : new URL(process.env.FRONTEND_URL ?? 'http://localhost:5173').origin;
      if (
        destination.origin !== expectedOrigin ||
        destination.origin === new URL(AUTH_SERVICE_URL).origin
      ) {
        throw new Error('Unexpected OAuth redirect destination');
      }
      if (path === '/auth/google') {
        const callback = new URL(
          destination.searchParams.get('redirect_uri') ?? '',
        );
        if (
          callback.origin === new URL(AUTH_SERVICE_URL).origin ||
          callback.pathname !== '/api/auth/google/callback'
        ) {
          throw new Error('Google callback must use the public gateway');
        }
      }
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(response.status, location);
    } catch {
      // Downstream error bodies/headers can contain internal URLs and credentials.
      throw new HttpException(
        {
          code: 'OAUTH_FAILED',
          message: 'Google sign-in could not be completed.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
