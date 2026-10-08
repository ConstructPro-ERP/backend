import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CalendarService } from '../../apps/calender-service/src/calendar.service';
import { GoogleCalendarClient } from '../../apps/calender-service/src/google-calendar.client';
import {
  CalendarConnectionRepository,
  SaveCalendarConnectionInput,
} from '../../apps/calender-service/src/repositories/calendar-connection.repository';
import { TokenEncryptionService } from '../../apps/calender-service/src/token-encryption.service';

export const eventInput = {
  summary: 'Site meeting',
  startDateTime: '2026-10-10T09:00:00+05:30',
  endDateTime: '2026-10-10T10:00:00+05:30',
  timeZone: 'Asia/Colombo',
};

export function createFixture() {
  const config = new ConfigService({
    GOOGLE_CALENDAR_STATE_SECRET: 'calendar-test-state-secret',
    GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString(
      'base64',
    ),
  });
  const jwt = new JwtService();
  const encryption = new TokenEncryptionService(config);
  const rows = new Map<
    string,
    SaveCalendarConnectionInput & { connectedAt: Date }
  >();
  const repository = {
    findByUserId: jest.fn((id: string) =>
      Promise.resolve(rows.get(id) ?? null),
    ),
    upsert: jest.fn((id: string, data: SaveCalendarConnectionInput) => {
      const row = { ...data, connectedAt: new Date('2026-10-08T00:00:00Z') };
      rows.set(id, row);
      return Promise.resolve(row);
    }),
    deleteByUserId: jest.fn((id: string) =>
      Promise.resolve({ count: Number(rows.delete(id)) }),
    ),
  };
  const events = {
    list: jest.fn().mockResolvedValue({ data: { items: [] } }),
    insert: jest.fn().mockResolvedValue({ data: { id: 'event-1' } }),
    patch: jest
      .fn()
      .mockResolvedValue({ data: { id: 'event-1', summary: 'Updated' } }),
    delete: jest.fn().mockResolvedValue({}),
  };
  const google = {
    generateAuthorizationUrl: jest.fn(
      (state: string) =>
        `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    ),
    exchangeCode: jest.fn().mockResolvedValue({
      refresh_token: 'test-refresh-token',
      scope: 'calendar',
    }),
    createCalendar: jest.fn(() => ({ events })),
    revokeToken: jest.fn().mockResolvedValue(undefined),
  };
  const service = new CalendarService(
    repository as unknown as CalendarConnectionRepository,
    google as unknown as GoogleCalendarClient,
    encryption,
    jwt,
    config,
  );
  async function connect(id = 'user-1') {
    const { state } = await service.createAuthorization(id);
    await service.handleOAuthCallback('test-code', state);
  }
  return {
    config,
    jwt,
    encryption,
    rows,
    repository,
    events,
    google,
    service,
    connect,
  };
}
