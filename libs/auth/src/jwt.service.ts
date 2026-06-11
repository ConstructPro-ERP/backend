import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { JwtPayload } from '@common/interfaces/jwt-payload.interface.js';

@Injectable()
export class JwtTokenService {
  constructor(
    private readonly jwt: NestJwtService,
    private readonly config: ConfigService,
  ) {}

  signAccess(payload: JwtPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.secret'),
      expiresIn: this.config.get<string>('jwt.expiry') ?? '15m',
    });
  }

  signRefresh(payload: Pick<JwtPayload, 'sub'>): string {
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.config.get<string>('jwt.refreshExpiry') ?? '7d',
    });
  }

  verifyAccess(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token, {
      secret: this.config.get<string>('jwt.secret'),
    });
  }

  verifyRefresh(token: string): Pick<JwtPayload, 'sub'> {
    return this.jwt.verify<Pick<JwtPayload, 'sub'>>(token, {
      secret: this.config.get<string>('jwt.refreshSecret'),
    });
  }
}
