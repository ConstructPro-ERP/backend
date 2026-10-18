import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { of, throwError } from 'rxjs';
import { AuthGatewayController } from './auth-gateway.controller';

describe('Gateway Google OAuth redirects', () => {
  const get = jest.fn();
  const controller = new AuthGatewayController({
    get,
  } as unknown as HttpService);
  const redirect = jest.fn();
  const setHeader = jest.fn();
  const res = { redirect, setHeader } as unknown as Response;
  const service = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3333';
  const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const google =
    'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=' +
    encodeURIComponent('https://gateway.example/api/auth/google/callback');

  beforeEach(() => jest.clearAllMocks());

  it('contacts auth internally and redirects the browser straight to Google', async () => {
    get.mockReturnValue(of({ status: 302, headers: { location: google } }));
    await controller.googleLogin(res);
    expect(get).toHaveBeenCalledWith(
      `${service}/auth/google`,
      expect.objectContaining({
        maxRedirects: 0,
        timeout: 15000,
      }),
    );
    expect(redirect).toHaveBeenCalledWith(302, google);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('preserves callback encoding and relays the frontend token fragment', async () => {
    const location = `${frontend}/auth/callback#token=test-token`;
    get.mockReturnValue(of({ status: 302, headers: { location } }));
    await controller.googleCallback(
      {
        originalUrl: '/api/auth/google/callback?code=a%2Bb%2Fc&state=x%26y',
      } as Request,
      res,
    );
    expect(get).toHaveBeenCalledWith(
      `${service}/auth/google/callback?code=a%2Bb%2Fc&state=x%26y`,
      expect.any(Object),
    );
    expect(redirect).toHaveBeenCalledWith(302, location);
  });

  it.each([
    { status: 302, headers: { location: `${service}/auth/google` } },
    { status: 302, headers: { location: 'https://untrusted.example/' } },
    { status: 302, headers: {} },
    { status: 200, headers: {} },
    {
      status: 302,
      headers: {
        location:
          'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=' +
          encodeURIComponent(`${service}/auth/google/callback`),
      },
    },
  ])(
    'rejects invalid redirects without exposing downstream data (%j)',
    async (response) => {
      get.mockReturnValue(of(response));
      await expect(controller.googleLogin(res)).rejects.toMatchObject({
        status: 502,
      });
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it('sanitizes downstream failures', async () => {
    get.mockReturnValue(
      throwError(() => new Error(`${service}/private?secret=value`)),
    );
    try {
      await controller.googleLogin(res);
      throw new Error('Expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toEqual({
        code: 'OAUTH_FAILED',
        message: 'Google sign-in could not be completed.',
      });
    }
    expect(redirect).not.toHaveBeenCalled();
  });
});
