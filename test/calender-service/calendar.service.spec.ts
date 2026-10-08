import { createFixture, eventInput } from './fixtures';

describe('CalendarService', () => {
  let f: ReturnType<typeof createFixture>;
  beforeEach(() => {
    f = createFixture();
  });

  it('signs user-bound, expiring OAuth state with a unique nonce', async () => {
    const first = await f.service.createAuthorization('user-1');
    const second = await f.service.createAuthorization('user-1');
    const payload = f.jwt.verify<{
      sub: string;
      purpose: string;
      nonce: string;
      exp: number;
      iat: number;
    }>(first.state, {
      secret: 'calendar-test-state-secret',
    });
    expect(payload).toMatchObject({
      sub: 'user-1',
      purpose: 'google-calendar',
    });
    expect(typeof payload.nonce).toBe('string');
    expect(payload.nonce.length).toBeGreaterThan(0);
    expect(payload.exp - payload.iat).toBe(600);
    expect(first.state).not.toBe(second.state);
    expect(f.google.generateAuthorizationUrl).toHaveBeenCalledWith(first.state);
  });

  it.each([
    { sub: 'user-1', nonce: 'nonce', purpose: 'wrong' },
    { nonce: 'nonce', purpose: 'google-calendar' },
    { sub: 'user-1', purpose: 'google-calendar' },
  ])('rejects invalid OAuth claims: %j', async (claims) => {
    const state = f.jwt.sign(claims, { secret: 'calendar-test-state-secret' });
    await expect(
      f.service.handleOAuthCallback('code', state),
    ).rejects.toMatchObject({ response: { code: 'CALENDAR_INVALID_STATE' } });
    expect(f.google.exchangeCode).not.toHaveBeenCalled();
  });

  it('encrypts refresh tokens and preserves them on reconnect without a new token', async () => {
    await f.connect();
    const original = { ...f.rows.get('user-1')! };
    expect(original.encryptedRefreshToken).not.toBe('test-refresh-token');
    expect(
      f.encryption.decrypt(
        original.encryptedRefreshToken,
        original.tokenIv,
        original.tokenAuthTag,
      ),
    ).toBe('test-refresh-token');
    f.google.exchangeCode.mockResolvedValue({ scope: 'updated-scope' });
    await f.connect();
    expect(f.rows.get('user-1')).toEqual({
      ...original,
      scope: 'updated-scope',
    });
  });

  it('requires a refresh token for a first connection', async () => {
    f.google.exchangeCode.mockResolvedValue({});
    await expect(f.connect()).rejects.toMatchObject({
      response: { code: 'CALENDAR_REFRESH_TOKEN_MISSING' },
    });
    expect(f.repository.upsert).not.toHaveBeenCalled();
  });

  it('maps failed code exchanges without persisting credentials', async () => {
    f.google.exchangeCode.mockRejectedValue(new Error('provider failed'));
    await expect(f.connect()).rejects.toMatchObject({
      response: { code: 'CALENDAR_AUTHORIZATION_FAILED' },
    });
    expect(f.rows.size).toBe(0);
  });

  it('uses saved calendar and decrypted token, with default list options', async () => {
    await f.connect();
    f.rows.get('user-1')!.calendarId = 'custom-calendar';
    f.events.list.mockResolvedValue({ data: {} });
    await expect(f.service.listEvents('user-1', {})).resolves.toEqual([]);
    expect(f.google.createCalendar).toHaveBeenCalledWith('test-refresh-token');
    expect(f.events.list).toHaveBeenCalledWith({
      calendarId: 'custom-calendar',
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });
  });

  it('maps all event creation fields to Google', async () => {
    await f.connect();
    await f.service.createEvent('user-1', {
      ...eventInput,
      description: 'Review',
      location: 'Colombo',
    });
    expect(f.events.insert).toHaveBeenCalledWith({
      calendarId: 'primary',
      requestBody: {
        summary: 'Site meeting',
        description: 'Review',
        location: 'Colombo',
        start: { dateTime: eventInput.startDateTime, timeZone: 'Asia/Colombo' },
        end: { dateTime: eventInput.endDateTime, timeZone: 'Asia/Colombo' },
      },
    });
  });

  it('patches only supplied fields, including empty descriptions', async () => {
    await f.connect();
    await f.service.updateEvent('user-1', 'event-1', { description: '' });
    expect(f.events.patch).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'event-1',
      requestBody: { description: '' },
    });
  });

  it.each([
    { startDateTime: eventInput.startDateTime },
    { endDateTime: eventInput.endDateTime },
    { timeZone: 'UTC' },
    {
      startDateTime: eventInput.endDateTime,
      endDateTime: eventInput.startDateTime,
    },
  ])('rejects incomplete or reversed update times: %j', async (dto) => {
    await expect(
      f.service.updateEvent('user-1', 'event-1', dto),
    ).rejects.toMatchObject({
      response: { code: 'CALENDAR_INVALID_DATE_RANGE' },
    });
    expect(f.events.patch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'CALENDAR_REAUTH_REQUIRED'],
    [403, 'CALENDAR_PERMISSION_DENIED'],
    [404, 'CALENDAR_EVENT_NOT_FOUND'],
    [500, 'CALENDAR_GOOGLE_API_ERROR'],
  ])('maps provider status %i across CRUD operations', async (status, code) => {
    await f.connect();
    for (const mock of Object.values(f.events))
      mock.mockRejectedValue({ response: { status } });
    for (const operation of [
      () => f.service.listEvents('user-1', {}),
      () => f.service.createEvent('user-1', eventInput),
      () => f.service.updateEvent('user-1', 'event-1', { summary: 'Updated' }),
      () => f.service.deleteEvent('user-1', 'event-1'),
    ])
      await expect(operation()).rejects.toMatchObject({ response: { code } });
  });

  it('requires reconnection for invalid_grant', async () => {
    await f.connect();
    f.events.list.mockRejectedValue({
      response: { status: 400, data: { error: 'invalid_grant' } },
    });
    await expect(f.service.listEvents('user-1', {})).rejects.toMatchObject({
      response: { code: 'CALENDAR_REAUTH_REQUIRED' },
    });
  });

  it('removes local credentials even if revocation fails; disconnect is idempotent', async () => {
    await f.connect();
    f.google.revokeToken.mockRejectedValue(new Error('offline'));
    await expect(f.service.disconnect('user-1')).resolves.toEqual({
      connected: false,
    });
    await expect(f.service.disconnect('user-1')).resolves.toEqual({
      connected: false,
    });
    expect(f.rows.size).toBe(0);
    expect(f.google.revokeToken).toHaveBeenCalledTimes(1);
  });
});
