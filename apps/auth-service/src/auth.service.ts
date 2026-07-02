import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { SignOptions } from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../shared/error-codes';

interface GoogleUserPayload {
  email: string;
  displayName: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async register(
    username: string,
    password: string,
    email: string,
    roleId: string,
  ) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new HttpException(
        {
          code: ErrorCode.USER_ALREADY_EXISTS,
          message: 'An account with this email already exists.',
        },
        HttpStatus.CONFLICT,
      );
    }
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!role) {
      throw new HttpException(
        {
          code: ErrorCode.ROLE_NOT_FOUND,
          message: 'Role you assigned is incorrect.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: {
        fullName: username,
        password: hashedPassword,
        email,
        roleId,
        status: 'ACTIVE',
      },
    });

    return this.issueTokenForUser(user);
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) return null;
    const isMatch = await bcrypt.compare(password, user.password);
    return isMatch ? user : null;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) {
      throw new HttpException(
        {
          code: ErrorCode.INVALID_CREDENTIALS,
          message: 'Email or password is incorrect.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.issueTokenForUser(user);
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { role: { select: { roleName: true } } },
    });
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        username: string;
      }>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const newPayload = { sub: payload.sub, username: payload.username };
      return {
        accessToken: this.jwtService.sign(newPayload, {
          expiresIn: (this.configService.get<string>('JWT_EXPIRY') ||
            '15m') as SignOptions['expiresIn'],
        }),
        refreshToken: this.jwtService.sign(newPayload, {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRY') ||
            '7d') as SignOptions['expiresIn'],
        }),
      };
    } catch {
      throw new HttpException(
        {
          code: ErrorCode.TOKEN_INVALID,
          message: 'Invalid or expired refresh token',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  async findOrCreateGoogleUser(payload: GoogleUserPayload) {
    const existing = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (existing) {
      return existing;
    }

    const defaultRole = await this.prisma.role.findFirst({
      where: { roleName: 'CLIENT_PORTAL_USER' },
      select: { id: true },
    });

    if (!defaultRole) {
      throw new HttpException(
        {
          code: ErrorCode.ROLE_NOT_FOUND,
          message: 'Default Google sign-in role is not configured.',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return this.prisma.user.create({
      data: {
        email: payload.email,
        fullName: payload.displayName,
        password: null,
        status: 'ACTIVE',
        roleId: defaultRole.id,
      },
    });
  }

  issueTokenForUser(user: { id: string; fullName: string; email?: string }) {
    const payload = { sub: user.id, username: user.fullName };
    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: (this.configService.get<string>('JWT_EXPIRY') ||
          '15m') as SignOptions['expiresIn'],
      }),
      refreshToken: this.jwtService.sign(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRY') ||
          '7d') as SignOptions['expiresIn'],
      }),
      user: { id: user.id, username: user.fullName, email: user.email },
    };
  }
}
