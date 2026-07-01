import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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

    return this.issueTokenForUser({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
    });
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

    return this.issueTokenForUser({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
    });
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
      if (existing.fullName !== payload.displayName) {
        return this.prisma.user.update({
          where: { id: existing.id },
          data: { fullName: payload.displayName },
        });
      }
      return existing;
    }

    const defaultRole = await this.prisma.role.findFirst({
      where: {
        roleName: {
          in: ['CLIENT_PORTAL_USER', 'ACCOUNTANT', 'PROJECT_MANAGER'],
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return this.prisma.user.create({
      data: {
        email: payload.email,
        fullName: payload.displayName,
        password: null,
        roleId: defaultRole?.id ?? null,
        status: 'ACTIVE',
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
      user: {
        id: user.id,
        username: user.fullName,
        email: user.email,
      },
    };
  }
}
