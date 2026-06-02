// File: `backend/apps/api-gateway/src/controllers/auth-gateway.controller.ts`
import { Controller, Post, Body, Get, Req, UseGuards } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { Request } from 'express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';

// DTO placeholders
class LoginDto {
  username!: string;
  password!: string;
}
class RegisterDto {
  username!: string;
  password!: string;
  email?: string;
}

// add an authenticated request type
type AuthRequest = Request & { user?: any };

@Controller('auth')
export class AuthGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const resp = await firstValueFrom(
      this.httpService.post('http://localhost:3333/auth/login', dto),
    );
    return resp.data;
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const resp = await firstValueFrom(
      this.httpService.post('http://localhost:3333/auth/register', dto),
    );
    return resp.data;
  }

  // Protected route: token validated by JwtAuthGuard, user attached to req.user
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: AuthRequest) {
    return req.user;
  }

  // Example role-protected route
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('admin')
  adminOnly(@Req() req: AuthRequest) {
    return { role: 'admin', user: req.user };
  }
}
