// typescript
import { Controller, Post, Body, Get, Req } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { Request } from 'express';

// use env var with a safe default
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3333';

class LoginDto {
  username!: string;
  password!: string;
}
class RegisterDto {
  username!: string;
  password!: string;
  email?: string;
}

@Controller('auth')
export class AuthGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const resp = await firstValueFrom(
      this.httpService.post(`${AUTH_SERVICE_URL}/auth/login`, dto),
    );
    return resp.data;
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const resp = await firstValueFrom(
      this.httpService.post(`${AUTH_SERVICE_URL}/auth/register`, dto),
    );
    return resp.data;
  }

  @Get('me')
  async me(@Req() req: Request) {
    const token = req.headers.authorization;
    const resp = await firstValueFrom(
      this.httpService.get(`${AUTH_SERVICE_URL}/auth/me`, {
        headers: { authorization: token },
      }),
    );
    return resp.data;
  }
}