import { HttpService } from '@nestjs/axios';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import { of, throwError } from 'rxjs';
import request from 'supertest';
import { CalendarModule } from '../../apps/calender-service/src/calendar.module';
import { GoogleCalendarClient } from '../../apps/calender-service/src/google-calendar.client';
import { CalendarConnectionRepository } from '../../apps/calender-service/src/repositories/calendar-connection.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { createFixture, eventInput } from './fixtures';

const projectId = '11111111-1111-4111-8111-111111111111';
const scope = { projectId };

describe('Calendar service HTTP integration: project events', () => {
  let app: INestApplication<Server>;
  let fixture: ReturnType<typeof createFixture>;
  const auth = { get: jest.fn() };

  beforeEach(async () => {
    fixture = createFixture();
    auth.get.mockReset().mockReturnValue(of({ data: { id: 'user-1' } }));
    fixture.prisma.project.findUnique.mockResolvedValue({
      id: projectId,
      projectManagerId: 'user-1',
      status: 'ACTIVE',
    });
    fixture.events.get.mockResolvedValue({
      data: {
        id: 'event-1',
        extendedProperties: { private: { constructProProjectId: projectId } },
      },
    });
    const module = await Test.createTestingModule({ imports: [CalendarModule] })
      .overrideProvider(ConfigService)
      .useValue(fixture.config)
      .overrideProvider(CalendarConnectionRepository)
      .useValue(fixture.repository)
      .overrideProvider(GoogleCalendarClient)
      .useValue(fixture.google)
      .overrideProvider(HttpService)
      .useValue(auth)
      .overrideProvider(PrismaService)
      .useValue(fixture.prisma)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await fixture.connect();
  });

  afterEach(async () => {
    await app?.close();
  });

  function call(
    method: 'get' | 'post' | 'patch' | 'delete',
    path = '/calendar/events',
  ) {
    return request(app.getHttpServer())
      [method](path)
      .set('Authorization', 'Bearer calendar-integration-token');
  }

  function actor(roleName: string, userId = 'user-1', status = 'ACTIVE') {
    fixture.prisma.user.findUnique.mockResolvedValue({
      id: userId,
      status,
      role: { roleName },
    });
    auth.get.mockReturnValue(of({ data: { id: userId } }));
  }

  it('checks authentication before accessing project data', async () => {
    await request(app.getHttpServer())
      .get('/calendar/events')
      .query(scope)
      .expect(401);
    auth.get.mockReturnValue(throwError(() => new Error('Invalid token')));
    await call('get').query(scope).expect(401);
    expect(fixture.prisma.project.findUnique).not.toHaveBeenCalled();
    expect(fixture.events.list).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT'])(
    'allows %s to read project events',
    async (role) => {
      actor(role);
      await call('get').query(scope).expect(200).expect([]);
      expect(fixture.events.list).toHaveBeenCalledWith({
        calendarId: 'primary',
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
        privateExtendedProperty: [`constructProProjectId=${projectId}`],
      });
      expect(fixture.prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        include: { role: true },
      });
    },
  );

  it.each(['ADMIN', 'PROJECT_MANAGER'])(
    'allows %s to create tagged events',
    async (role) => {
      actor(role);
      await call('post')
        .send({ ...eventInput, projectId })
        .expect(201)
        .expect({ id: 'event-1' });
      expect(fixture.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: {
          summary: eventInput.summary,
          extendedProperties: { private: { constructProProjectId: projectId } },
          start: {
            dateTime: eventInput.startDateTime,
            timeZone: eventInput.timeZone,
          },
          end: {
            dateTime: eventInput.endDateTime,
            timeZone: eventInput.timeZone,
          },
        },
      });
      expect(fixture.google.createCalendar).toHaveBeenCalledWith(
        'test-refresh-token',
      );
    },
  );

  it.each(['ACCOUNTANT', 'SALES_MANAGER', 'CLIENT_PORTAL_USER'])(
    'rejects %s project writes',
    async (role) => {
      actor(role);
      await call('post')
        .send({ ...eventInput, projectId })
        .expect(403);
      await call('patch', '/calendar/events/event-1')
        .query(scope)
        .send({ summary: 'Changed' })
        .expect(403);
      await call('delete', '/calendar/events/event-1').query(scope).expect(403);
      expect(fixture.google.createCalendar).not.toHaveBeenCalled();
    },
  );

  it('denies another project manager access before contacting Google', async () => {
    actor('PROJECT_MANAGER', 'other-manager');
    await call('get').query(scope).expect(403);
    await call('post')
      .send({ ...eventInput, projectId })
      .expect(403);
    expect(fixture.google.createCalendar).not.toHaveBeenCalled();
  });

  it('denies inactive users even with an admin role', async () => {
    actor('ADMIN', 'user-1', 'INACTIVE');
    await call('get').query(scope).expect(403);
    expect(fixture.events.list).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing project', async () => {
    fixture.prisma.project.findUnique.mockResolvedValue(null);
    await call('get').query(scope).expect(404);
    expect(fixture.events.list).not.toHaveBeenCalled();
  });

  it.each(['COMPLETED', 'CANCELLED'])(
    'keeps %s projects read-only',
    async (status) => {
      fixture.prisma.project.findUnique.mockResolvedValue({
        id: projectId,
        projectManagerId: 'user-1',
        status,
      });
      await call('get').query(scope).expect(200);
      await call('post')
        .send({ ...eventInput, projectId })
        .expect(403);
      await call('patch', '/calendar/events/event-1')
        .query(scope)
        .send({ summary: 'Changed' })
        .expect(403);
      await call('delete', '/calendar/events/event-1').query(scope).expect(403);
      expect(fixture.events.insert).not.toHaveBeenCalled();
      expect(fixture.events.patch).not.toHaveBeenCalled();
      expect(fixture.events.delete).not.toHaveBeenCalled();
    },
  );

  it('collects all project pages while preserving scope and date filters', async () => {
    fixture.events.list
      .mockResolvedValueOnce({
        data: { items: [{ id: 'first' }], nextPageToken: 'page-2' },
      })
      .mockResolvedValueOnce({ data: { items: [{ id: 'second' }] } });
    await call('get')
      .query({
        ...scope,
        maxResults: '1',
        timeMin: eventInput.startDateTime,
        timeMax: eventInput.endDateTime,
      })
      .expect(200)
      .expect([{ id: 'first' }, { id: 'second' }]);
    expect(fixture.events.list).toHaveBeenCalledTimes(2);
    expect(fixture.events.list).toHaveBeenLastCalledWith({
      calendarId: 'primary',
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 1,
      privateExtendedProperty: [`constructProProjectId=${projectId}`],
      timeMin: eventInput.startDateTime,
      timeMax: eventInput.endDateTime,
      pageToken: 'page-2',
    });
  });

  it('checks event ownership before updating and deleting', async () => {
    await call('patch', '/calendar/events/event-1')
      .query(scope)
      .send({ summary: 'Changed' })
      .expect(200);
    expect(fixture.events.patch).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'event-1',
      requestBody: { summary: 'Changed' },
    });
    await call('delete', '/calendar/events/event-1')
      .query(scope)
      .expect(200)
      .expect({ deleted: true });
    expect(fixture.events.get).toHaveBeenCalledTimes(2);
    expect(fixture.events.get).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'event-1',
    });
    expect(fixture.events.delete).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'event-1',
    });
  });

  it('prevents mutation of an event belonging to another project', async () => {
    fixture.events.get.mockResolvedValue({
      data: {
        extendedProperties: { private: { constructProProjectId: 'other' } },
      },
    });
    await call('patch', '/calendar/events/event-1')
      .query(scope)
      .send({ summary: 'Changed' })
      .expect(404);
    await call('delete', '/calendar/events/event-1').query(scope).expect(404);
    expect(fixture.events.patch).not.toHaveBeenCalled();
    expect(fixture.events.delete).not.toHaveBeenCalled();
  });

  it('returns an existing matching event after a retried create', async () => {
    fixture.events.insert.mockRejectedValue({ response: { status: 409 } });
    const existing = {
      id: 'abcde123',
      extendedProperties: { private: { constructProProjectId: projectId } },
    };
    fixture.events.get.mockResolvedValue({ data: existing });
    await call('post')
      .send({ ...eventInput, projectId, eventId: 'abcde123' })
      .expect(201)
      .expect(existing);
    expect(fixture.events.get).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'abcde123',
    });
  });

  it('does not expose another project event on a create conflict', async () => {
    fixture.events.insert.mockRejectedValue({ response: { status: 409 } });
    fixture.events.get.mockResolvedValue({
      data: {
        id: 'abcde123',
        extendedProperties: { private: { constructProProjectId: 'other' } },
      },
    });
    await call('post')
      .send({ ...eventInput, projectId, eventId: 'abcde123' })
      .expect(502);
  });

  it('treats deletion of an already absent project event as successful', async () => {
    fixture.events.get.mockRejectedValue({ response: { status: 404 } });
    await call('delete', '/calendar/events/event-1')
      .query(scope)
      .expect(200)
      .expect({ deleted: true });
    expect(fixture.events.delete).not.toHaveBeenCalled();
  });

  it.each([
    [401, 401, 'CALENDAR_REAUTH_REQUIRED'],
    [403, 403, 'CALENDAR_PERMISSION_DENIED'],
    [404, 404, 'CALENDAR_EVENT_NOT_FOUND'],
    [503, 502, 'CALENDAR_GOOGLE_API_ERROR'],
  ])('maps Google %s to HTTP %s', async (upstreamStatus, status, code) => {
    fixture.events.list.mockRejectedValue({
      response: { status: upstreamStatus },
    });
    const response = await call('get').query(scope).expect(status);
    expect(response.body).toMatchObject({ code });
  });

  it('does not share a calendar connection between users', async () => {
    actor('ADMIN', 'other-user');
    const response = await call('get').query(scope).expect(401);
    expect(response.body).toMatchObject({ code: 'CALENDAR_NOT_CONNECTED' });
    expect(fixture.google.createCalendar).not.toHaveBeenCalled();
  });

  it('disconnects locally even when Google revocation fails', async () => {
    fixture.google.revokeToken.mockRejectedValue(
      new Error('Provider unavailable'),
    );
    await call('delete', '/calendar/connection')
      .expect(200)
      .expect({ connected: false });
    expect(fixture.rows.has('user-1')).toBe(false);
    await call('get').query(scope).expect(401);
    expect(fixture.events.list).not.toHaveBeenCalled();
  });

  it('rejects invalid project identifiers and event IDs before provider calls', async () => {
    await call('get').query({ projectId: 'invalid' }).expect(400);
    await call('post')
      .send({ ...eventInput, projectId, eventId: 'INVALID!' })
      .expect(400);
    expect(fixture.google.createCalendar).not.toHaveBeenCalled();
  });
});
