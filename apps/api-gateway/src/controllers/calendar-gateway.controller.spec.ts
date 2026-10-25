import { HttpService } from '@nestjs/axios';
import type { Request, Response } from 'express';
import { of } from 'rxjs';
import { CalendarGatewayController } from './calendar-gateway.controller';

describe('Calendar gateway OAuth cookie', () => {
  const originalEnv = process.env.NODE_ENV;
  const post = jest.fn();
  const get = jest.fn();
  const controller = new CalendarGatewayController({
    post,
    get,
  } as unknown as HttpService);
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  const redirect = jest.fn();
  const res = { cookie, clearCookie, redirect } as unknown as Response;
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  });

  it.each(['production', 'development'])(
    'sets and clears matching cookie attributes in %s',
    async (environment) => {
      process.env.NODE_ENV = environment;
      post.mockReturnValue(
        of({
          data: {
            state: 'signed-state',
            authorizationUrl: 'https://accounts.google.com/',
          },
        }),
      );
      await controller.connect(
        { headers: { authorization: 'Bearer test' } } as Request,
        res,
      );
      const attributes = {
        httpOnly: true,
        secure: environment === 'production',
        sameSite: environment === 'production' ? 'none' : 'lax',
        path: '/api/calendar/oauth/callback',
      };
      expect(cookie).toHaveBeenCalledWith(
        'constructpro_calendar_oauth_state',
        'signed-state',
        expect.objectContaining(attributes),
      );
      get.mockReturnValue(of({ data: { connected: true } }));
      await controller.callback(
        {
          cookies: { constructpro_calendar_oauth_state: 'signed-state' },
        } as Parameters<typeof controller.callback>[0],
        res,
        'code',
        'signed-state',
      );
      expect(redirect).toHaveBeenCalledWith(
        expect.stringContaining('calendar=connected'),
      );
      expect(clearCookie).toHaveBeenCalledWith(
        'constructpro_calendar_oauth_state',
        expect.objectContaining(attributes),
      );
    },
  );

  it.each([{}, { constructpro_calendar_oauth_state: 'wrong-state' }])(
    'rejects missing or mismatched cookies without exchanging the code',
    async (cookies) => {
      await controller.callback(
        { cookies } as Parameters<typeof controller.callback>[0],
        res,
        'code',
        'signed-state',
      );
      expect(get).not.toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledWith(
        expect.stringContaining('calendar=error'),
      );
    },
  );
});
