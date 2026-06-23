import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  HttpException,
  Res,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { IsString, IsNotEmpty, IsEmail, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL ?? 'http://localhost:3333';

// ← Add this here
interface DownstreamError {
  statusCode?: number;
  code?: string;
  message?: string;
  details?: string[];
}

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

@Controller('auth')
export class AuthGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.forwardRequest(() =>
      this.httpService.post(`${AUTH_SERVICE_URL}/auth/login`, dto),
    );
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.forwardRequest(() =>
      this.httpService.post(`${AUTH_SERVICE_URL}/auth/register`, dto),
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request) {
    return this.forwardRequest(() =>
      this.httpService.get(`${AUTH_SERVICE_URL}/auth/me`, {
        headers: { authorization: req.headers.authorization },
      }),
    );
  }

  private async forwardRequest(call: () => any) {
    try {
      const resp = await firstValueFrom<AxiosResponse>(call());
      return resp.data;
    } catch (err: any) {
      const status = err?.response?.status; // ← HTTP status from axios
      const downstream = err?.response?.data as DownstreamError | undefined;

      if (status && downstream) {
        throw new HttpException(
          {
            code: downstream.code ?? 'INTERNAL_ERROR',
            message: downstream.message ?? 'Something went wrong.',
            details: downstream.details,
          },
          status, // ← use axios response status, not downstream.statusCode
        );
      }

      // Auth service is down / network error
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
