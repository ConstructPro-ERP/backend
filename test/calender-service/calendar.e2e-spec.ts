/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { HttpService } from '@nestjs/axios';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import request from 'supertest';
import { CalendarModule } from '../../apps/calender-service/src/calendar.module';
import { GoogleCalendarClient } from '../../apps/calender-service/src/google-calendar.client';
import { CalendarConnectionRepository } from '../../apps/calender-service/src/repositories/calendar-connection.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { createFixture, eventInput } from './fixtures';

describe('Calendar HTTP E2E (external dependencies mocked)', () => {
  let app: INestApplication;
  let f: ReturnType<typeof createFixture>;
  const auth = { get: jest.fn() };
  const bearer = 'Bearer test-access-token';

  beforeEach(async () => {
    f = createFixture();
    auth.get
      .mockReset()
      .mockReturnValue(of({ data: { data: { id: 'user-1' } } }));
    const module = await Test.createTestingModule({ imports: [CalendarModule] })
      .overrideProvider(ConfigService)
      .useValue(f.config)
      .overrideProvider(CalendarConnectionRepository)
      .useValue(f.repository)
      .overrideProvider(GoogleCalendarClient)
      .useValue(f.google)
      .overrideProvider(HttpService)
      .useValue(auth)
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('serves public health without authentication', async () => {
    await request(app.getHttpServer())
      .get('/calendar/health')
      .expect(200)
      .expect({ status: 'ok', service: 'calendar-service' });
    expect(auth.get).not.toHaveBeenCalled();
  });

  it('connects, creates, lists, updates, deletes and disconnects over HTTP', async () => {
    const server = app.getHttpServer();
    await request(server)
      .get('/calendar/status')
      .set('Authorization', bearer)
      .expect(200)
      .expect({ connected: false, calendarId: null, connectedAt: null });
    const authorization = await request(server)
      .post('/calendar/connect')
      .set('Authorization', bearer)
      .expect(201);
    expect(authorization.body.authorizationUrl).toContain(
      authorization.body.state,
    );
    await request(server)
      .get('/calendar/oauth/callback')
      .query({ code: 'test-code', state: authorization.body.state })
      .expect(200)
      .expect({ connected: true });
    expect(f.google.exchangeCode).toHaveBeenCalledWith('test-code');
    const status = await request(server)
      .get('/calendar/status')
      .set('Authorization', bearer)
      .expect(200);
    expect(status.body).toEqual({
      connected: true,
      calendarId: 'primary',
      connectedAt: '2026-10-08T00:00:00.000Z',
    });
    expect(JSON.stringify(status.body)).not.toContain('test-refresh-token');

    // Stateful provider fake verifies that later requests observe prior mutations.
    const stored = new Map<string, Record<string, unknown>>();
    f.events.insert.mockImplementation(
      ({ requestBody }: { requestBody: Record<string, unknown> }) => {
        const event = { id: 'event-1', ...requestBody };
        stored.set('event-1', event);
        return Promise.resolve({ data: event });
      },
    );
    f.events.list.mockImplementation(() =>
      Promise.resolve({
        data: { items: [...stored.values()] },
      }),
    );
    f.events.patch.mockImplementation(
      ({
        eventId,
        requestBody,
      }: {
        eventId: string;
        requestBody: Record<string, unknown>;
      }) => {
        const event = { ...stored.get(eventId), ...requestBody };
        stored.set(eventId, event);
        return Promise.resolve({ data: event });
      },
    );
    f.events.delete.mockImplementation(({ eventId }: { eventId: string }) => {
      stored.delete(eventId);
      return Promise.resolve({});
    });

    const created = await request(server)
      .post('/calendar/events')
      .set('Authorization', bearer)
      .send(eventInput)
      .expect(201);
    expect(created.body).toMatchObject({
      id: 'event-1',
      summary: eventInput.summary,
      start: { dateTime: eventInput.startDateTime, timeZone: 'Asia/Colombo' },
    });
    await request(server)
      .get('/calendar/events')
      .set('Authorization', bearer)
      .query({
        maxResults: '10',
        timeMin: eventInput.startDateTime,
        timeMax: eventInput.endDateTime,
      })
      .expect(200)
      .expect([created.body]);
    expect(f.events.list).toHaveBeenLastCalledWith({
      calendarId: 'primary',
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 10,
      timeMin: eventInput.startDateTime,
      timeMax: eventInput.endDateTime,
    });
    const updated = await request(server)
      .patch('/calendar/events/event-1')
      .set('Authorization', bearer)
      .send({ summary: 'Updated' })
      .expect(200);
    expect(updated.body.summary).toBe('Updated');
    await request(server)
      .get('/calendar/events')
      .set('Authorization', bearer)
      .expect(200)
      .expect([updated.body]);
    await request(server)
      .delete('/calendar/events/event-1')
      .set('Authorization', bearer)
      .expect(200)
      .expect({ deleted: true });
    await request(server)
      .get('/calendar/events')
      .set('Authorization', bearer)
      .expect(200)
      .expect([]);
    await request(server)
      .delete('/calendar/connection')
      .set('Authorization', bearer)
      .expect(200)
      .expect({ connected: false });
    expect(f.google.revokeToken).toHaveBeenCalledWith('test-refresh-token');
    expect(f.rows.has('user-1')).toBe(false);
    const disconnected = await request(server)
      .get('/calendar/events')
      .set('Authorization', bearer)
      .expect(401);
    expect(disconnected.body.code).toBe('CALENDAR_NOT_CONNECTED');
    expect(auth.get).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/me$/),
      { headers: { authorization: bearer } },
    );
  });

  it.each([
    ['get', '/calendar/status'],
    ['post', '/calendar/connect'],
    ['delete', '/calendar/connection'],
    ['get', '/calendar/events'],
    ['post', '/calendar/events'],
    ['patch', '/calendar/events/event-1'],
    ['delete', '/calendar/events/event-1'],
  ] as const)('protects %s %s without a token', async (method, path) => {
    const response = await request(app.getHttpServer())
      [method](path)
      .expect(401);
    expect(response.body.code).toBe('TOKEN_MISSING');
    expect(auth.get).not.toHaveBeenCalled();
  });

  it('rejects malformed authorization and revoked tokens', async () => {
    await request(app.getHttpServer())
      .get('/calendar/status')
      .set('Authorization', 'Basic abc')
      .expect(401);
    expect(auth.get).not.toHaveBeenCalled();
    auth.get.mockReturnValue(throwError(() => new Error('revoked')));
    const response = await request(app.getHttpServer())
      .get('/calendar/status')
      .set('Authorization', bearer)
      .expect(401);
    expect(response.body.code).toBe('TOKEN_INVALID');
    expect(f.repository.findByUserId).not.toHaveBeenCalled();
  });

  it.each([{ data: {} }, { id: 42 }])(
    'rejects an invalid auth-service user: %j',
    async (data) => {
      auth.get.mockReturnValue(of({ data }));
      await request(app.getHttpServer())
        .get('/calendar/status')
        .set('Authorization', bearer)
        .expect(401);
    },
  );

  it('isolates connections by the authenticated user and accepts unwrapped auth responses', async () => {
    await f.connect('user-1');
    auth.get.mockReturnValue(of({ data: { id: 'user-2' } }));
    await request(app.getHttpServer())
      .get('/calendar/status')
      .set('Authorization', bearer)
      .expect(200)
      .expect({ connected: false, calendarId: null, connectedAt: null });
    await request(app.getHttpServer())
      .post('/calendar/events')
      .set('Authorization', bearer)
      .send(eventInput)
      .expect(401);
    await request(app.getHttpServer())
      .delete('/calendar/connection')
      .set('Authorization', bearer)
      .expect(200);
    expect(f.rows.has('user-1')).toBe(true);
    expect(f.events.insert).not.toHaveBeenCalled();
    expect(f.google.revokeToken).not.toHaveBeenCalled();
  });

  it.each([
    [{ error: 'access_denied' }, 'CALENDAR_AUTHORIZATION_DENIED'],
    [{ code: 'code' }, 'CALENDAR_AUTHORIZATION_FAILED'],
    [{ state: 'state' }, 'CALENDAR_AUTHORIZATION_FAILED'],
    [{ code: 'code', state: 'tampered' }, 'CALENDAR_INVALID_STATE'],
  ])('rejects invalid OAuth callbacks: %j', async (query, code) => {
    const response = await request(app.getHttpServer())
      .get('/calendar/oauth/callback')
      .query(query)
      .expect(400);
    expect(response.body.code).toBe(code);
    expect(f.google.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects expired OAuth state', async () => {
    const state = f.jwt.sign(
      { sub: 'user-1', nonce: 'nonce', purpose: 'google-calendar' },
      { secret: 'calendar-test-state-secret', expiresIn: -1 },
    );
    const response = await request(app.getHttpServer())
      .get('/calendar/oauth/callback')
      .query({ code: 'code', state })
      .expect(400);
    expect(response.body.code).toBe('CALENDAR_INVALID_STATE');
    expect(f.google.exchangeCode).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { ...eventInput, summary: '' },
    { ...eventInput, startDateTime: 'invalid' },
    { ...eventInput, endDateTime: eventInput.startDateTime },
    { ...eventInput, endDateTime: '2026-10-09T09:00:00Z' },
    { ...eventInput, userId: 'another-user' },
  ])('rejects invalid event creation: %j', async (body) => {
    await f.connect();
    await request(app.getHttpServer())
      .post('/calendar/events')
      .set('Authorization', bearer)
      .send(body)
      .expect(400);
    expect(f.events.insert).not.toHaveBeenCalled();
  });

  it.each([
    { maxResults: '0' },
    { maxResults: '101' },
    { maxResults: '1.5' },
    { maxResults: 'abc' },
    { timeMin: 'invalid' },
    { timeMin: eventInput.endDateTime, timeMax: eventInput.startDateTime },
  ])('rejects invalid event queries: %j', async (query) => {
    await f.connect();
    await request(app.getHttpServer())
      .get('/calendar/events')
      .set('Authorization', bearer)
      .query(query)
      .expect(400);
    expect(f.events.list).not.toHaveBeenCalled();
  });

  it.each([
    { startDateTime: eventInput.startDateTime },
    { timeZone: 'UTC' },
    { summary: 42 },
    { unexpected: true },
  ])('rejects invalid event updates: %j', async (body) => {
    await f.connect();
    await request(app.getHttpServer())
      .patch('/calendar/events/event-1')
      .set('Authorization', bearer)
      .send(body)
      .expect(400);
    expect(f.events.patch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 401, 'CALENDAR_REAUTH_REQUIRED'],
    [403, 403, 'CALENDAR_PERMISSION_DENIED'],
    [404, 404, 'CALENDAR_EVENT_NOT_FOUND'],
    [500, 502, 'CALENDAR_GOOGLE_API_ERROR'],
  ])(
    'returns the public error contract for Google status %i',
    async (googleStatus, httpStatus, code) => {
      await f.connect();
      f.events.delete.mockRejectedValue({ response: { status: googleStatus } });
      const response = await request(app.getHttpServer())
        .delete('/calendar/events/event-1')
        .set('Authorization', bearer)
        .expect(httpStatus);
      expect(response.body.code).toBe(code);
    },
  );
});
