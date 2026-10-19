import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { AuthService } from '../../apps/auth-service/src/auth.service';
import { AuthController } from '../../apps/auth-service/src/auth.controller';
import { PrismaService } from '../../prisma/prisma.service';

describe('Google application session', () => {
  const user = { id: 'google-user-1', fullName: 'Google User' };
  let jwt: JwtService;
  let service: AuthService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    jwt = new JwtService({
      secret: 'test-access-secret',
      signOptions: { expiresIn: '15m' },
    });
    service = new AuthService(
      jwt,
      {} as PrismaService,
      new ConfigService({ JWT_REFRESH_SECRET: 'test-refresh-secret' }),
    );
  });

  afterEach(() => jest.useRealTimers());

  it('issues a 15-minute access token and a separate seven-day refresh token', () => {
    const tokens = service.issueTokenForUser(user);
    const access = jwt.verify<{ sub: string; iat: number; exp: number }>(
      tokens.accessToken,
    );
    const refresh = jwt.verify<{ sub: string; iat: number; exp: number }>(
      tokens.refreshToken,
      { secret: 'test-refresh-secret' },
    );
    expect(access.sub).toBe(user.id);
    expect(refresh.sub).toBe(user.id);
    expect(access.exp - access.iat).toBe(15 * 60);
    expect(refresh.exp - refresh.iat).toBe(7 * 24 * 60 * 60);
    expect(() => jwt.verify<object>(tokens.refreshToken)).toThrow();
  });

  it('renews a Google session after its access token expires', async () => {
    const original = service.issueTokenForUser(user);
    jest.setSystemTime(new Date('2026-01-01T00:16:00Z'));
    expect(() => jwt.verify<object>(original.accessToken)).toThrow(
      'jwt expired',
    );
    const renewed = await service.refreshTokens(original.refreshToken);
    expect(jwt.verify<{ sub: string }>(renewed.accessToken).sub).toBe(user.id);
    expect(renewed.accessToken).not.toBe(original.accessToken);
    expect(
      jwt.verify<{ sub: string }>(renewed.refreshToken, {
        secret: 'test-refresh-secret',
      }).sub,
    ).toBe(user.id);
  });

  it('rejects access tokens and expired refresh tokens as refresh credentials', async () => {
    const tokens = service.issueTokenForUser(user);
    await expect(
      service.refreshTokens(tokens.accessToken),
    ).rejects.toMatchObject({ status: 401 });
    jest.setSystemTime(new Date('2026-01-09T00:00:00Z'));
    await expect(
      service.refreshTokens(tokens.refreshToken),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('respects configured token lifetimes for Google sign-in', () => {
    const configured = new AuthService(
      jwt,
      {} as PrismaService,
      new ConfigService({
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_EXPIRY: '5m',
        JWT_REFRESH_EXPIRY: '2d',
      }),
    );
    const tokens = configured.issueTokenForUser(user);
    const access = jwt.verify<{ iat: number; exp: number }>(tokens.accessToken);
    const refresh = jwt.verify<{ iat: number; exp: number }>(
      tokens.refreshToken,
      { secret: 'test-refresh-secret' },
    );
    expect(access.exp - access.iat).toBe(300);
    expect(refresh.exp - refresh.iat).toBe(172800);
  });

  it('delivers both application tokens in the callback fragment, not the query', () => {
    const redirect = jest.fn<void, [string]>();
    const controller = new AuthController(service);
    controller.googleCallback(
      { user } as Parameters<AuthController['googleCallback']>[0],
      { redirect } as unknown as Response,
    );
    const destination = new URL(redirect.mock.calls[0][0]);
    expect(destination.search).toBe('');
    expect(destination.pathname).toBe('/auth/callback');
    const fragment = new URLSearchParams(destination.hash.slice(1));
    expect(jwt.verify<{ sub: string }>(fragment.get('token')!).sub).toBe(
      user.id,
    );
    expect(
      jwt.verify<{ sub: string }>(fragment.get('refreshToken')!, {
        secret: 'test-refresh-secret',
      }).sub,
    ).toBe(user.id);
  });
});
