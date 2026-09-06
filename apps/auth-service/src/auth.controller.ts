import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UsePipes,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import * as registerDto from './dto/register.dto';
import * as loginDto from './dto/login.dto';
import * as refreshDto from './dto/refresh-token.dto';
import { JwtAuthGuard } from './strategies/jwt.strategy';
import { ErrorCode } from '../../../shared/error-codes';
import { UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from './dto/zod-validation.pipe';

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
      // Token valid but user row was deleted — return 404, not 200
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Authenticated user no longer exists.',
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, role, ...safe } = user;

    // Safely extract the roleName, falling back to null to prevent runtime crashes.
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
  @Get('roles')
  async getRoles() {
    return this.authService.getRoles();
  }

  // @Get('google')
  // @UseGuards(AuthGuard('google'))
  // googleLogin() {
  //   // Passport redirects to Google; this handler body never executes
  // }
  //
  // // Google redirects back here after the user grants consent
  // @Get('google/callback')
  // @UseGuards(AuthGuard('google'))
  // googleCallback(
  //   @Req() req: AuthenticatedRequest & { user: any },
  //   @Res() res: Response,
  // ) {
  //   // req.user is set by GoogleStrategy.validate()
  //   const { accessToken } = this.authService.issueTokenForUser(req.user);
  //
  //   // Redirect the frontend to a deep-link that carries the token
  //   // Frontend reads the hash and stores it (avoids token in server logs)
  //   const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  //   res.redirect(`${frontendUrl}/auth/callback#token=${accessToken}`);
  // }
}
