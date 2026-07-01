import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { ErrorCode } from '../../../shared/error-codes';
import * as loginDto from './dto/login.dto';
import * as refreshDto from './dto/refresh-token.dto';
import * as registerDto from './dto/register.dto';
import { ZodValidationPipe } from './dto/zod-validation.pipe';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './strategies/jwt.strategy';

interface AuthenticatedRequest extends Request {
  user: { sub: string; username: string };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UsePipes(new ZodValidationPipe(registerDto.RegisterSchema))
  async register(@Body() dto: registerDto.RegisterDto) {
    return this.authService.register(
      dto.username,
      dto.password,
      dto.email,
      dto.roleId,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: loginDto.LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: AuthenticatedRequest) {
    const user = await this.authService.findById(req.user.sub);

    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Authenticated user no longer exists.',
      });
    }

    const { password, role, ...safe } = user;
    void password;

    const roleName = role?.roleName || null;

    return {
      ...safe,
      role: roleName,
      roles: roleName ? [roleName] : [],
    };
  }

  @Post('refresh')
  @UsePipes(new ZodValidationPipe(refreshDto.RefreshTokenSchema))
  async refresh(@Body() dto: refreshDto.RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    return;
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(
    @Req()
    req: Request & {
      user: { id: string; fullName: string; email?: string };
    },
    @Res() res: Response,
  ) {
    const { accessToken, refreshToken } = this.authService.issueTokenForUser(
      req.user,
    );
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

    res.redirect(
      `${frontendUrl}/auth/callback#token=${accessToken}&refreshToken=${refreshToken}`,
    );
  }
}
