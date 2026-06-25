import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './strategies/jwt.strategy';
import { ErrorCode } from '../../../shared/error-codes';

interface AuthenticatedRequest extends Request {
  user: { sub: string; username: string };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.username, dto.password, dto.email);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: AuthenticatedRequest) {
    const user = await this.authService.findById(req.user.sub);
    if (!user) {
      // Token valid but user row was deleted — return 404, not 200
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Authenticated user no longer exists.',
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, role, ...safe } = user;
    return {
      ...safe,
      role: role?.roleName || null,
      roles: role?.roleName ? [role.roleName] : [],
    };
  }
}
