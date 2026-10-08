import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '../../../shared/error-codes';
import { CalendarEventsQueryDto } from './dto/calendar-events-query.dto';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { GoogleCalendarClient } from './google-calendar.client';
import { CalendarConnectionRepository } from './repositories/calendar-connection.repository';
import { TokenEncryptionService } from './token-encryption.service';

interface CalendarOAuthState {
  sub: string;
  purpose: 'google-calendar';
  nonce: string;
}

interface GoogleApiErrorData {
  error?: string;
  error_description?: string;
  message?: string;
}

interface GoogleApiErrorShape {
  code?: number | string;
  message?: string;
  response?: {
    status?: number;
    data?: GoogleApiErrorData;
  };
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly connections: CalendarConnectionRepository,
    private readonly googleCalendarClient: GoogleCalendarClient,
    private readonly tokenEncryption: TokenEncryptionService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  getHealth() {
    return {
      status: 'ok',
      service: 'calendar-service',
    };
  }

  async createAuthorization(userId: string): Promise<{
    authorizationUrl: string;
    state: string;
  }> {
    const payload: CalendarOAuthState = {
      sub: userId,
      purpose: 'google-calendar',
      nonce: randomUUID(),
    };

    const state = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>(
        'GOOGLE_CALENDAR_STATE_SECRET',
      ),
      expiresIn: '10m' as SignOptions['expiresIn'],
    });

    return {
      authorizationUrl:
        this.googleCalendarClient.generateAuthorizationUrl(state),
      state,
    };
  }

  async handleOAuthCallback(code: string, state: string) {
    const payload = await this.verifyOAuthState(state);

    let tokens: Awaited<ReturnType<GoogleCalendarClient['exchangeCode']>>;

    try {
      tokens = await this.googleCalendarClient.exchangeCode(code);
    } catch {
      throw new BadRequestException({
        code: ErrorCode.CALENDAR_AUTHORIZATION_FAILED,
        message: 'Google Calendar authorization failed.',
      });
    }

    const existing = await this.connections.findByUserId(payload.sub);

    if (!tokens.refresh_token && !existing) {
      throw new BadRequestException({
        code: ErrorCode.CALENDAR_REFRESH_TOKEN_MISSING,
        message:
          'Google did not provide a refresh token. Reconnect Google Calendar and grant consent again.',
      });
    }

    if (tokens.refresh_token) {
      const encrypted = this.tokenEncryption.encrypt(tokens.refresh_token);

      await this.connections.upsert(payload.sub, {
        encryptedRefreshToken: encrypted.encryptedValue,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        scope: tokens.scope ?? existing?.scope ?? null,
        calendarId: existing?.calendarId ?? 'primary',
      });
    } else if (existing) {
      /*
       * Google does not always issue another refresh token
       * for an already-authorized account. Preserve the
       * existing encrypted token instead of overwriting it.
       */
      await this.connections.upsert(payload.sub, {
        encryptedRefreshToken: existing.encryptedRefreshToken,
        tokenIv: existing.tokenIv,
        tokenAuthTag: existing.tokenAuthTag,
        scope: tokens.scope ?? existing.scope,
        calendarId: existing.calendarId,
      });
    }

    return {
      connected: true,
    };
  }

  async getConnectionStatus(userId: string) {
    const connection = await this.connections.findByUserId(userId);

    if (!connection) {
      return {
        connected: false,
        calendarId: null,
        connectedAt: null,
      };
    }

    return {
      connected: true,
      calendarId: connection.calendarId,
      connectedAt: connection.connectedAt,
    };
  }

  async disconnect(userId: string) {
    const connection = await this.connections.findByUserId(userId);

    if (!connection) {
      return {
        connected: false,
      };
    }

    const refreshToken = this.decryptRefreshToken(connection);

    try {
      await this.googleCalendarClient.revokeToken(refreshToken);
    } catch (error: unknown) {
      /*
       * Local credentials are removed even when Google
       * revocation fails. ConstructPro must stop using
       * the credential immediately after disconnect.
       */
      this.logger.warn(
        `Google Calendar token revocation failed for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }

    await this.connections.deleteByUserId(userId);

    return {
      connected: false,
    };
  }

  async listEvents(userId: string, query: CalendarEventsQueryDto) {
    this.validateOptionalDateRange(query.timeMin, query.timeMax);

    const { calendar, calendarId } =
      await this.getAuthenticatedCalendar(userId);

    try {
      const response = await calendar.events.list({
        calendarId,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: query.maxResults ?? 50,
        ...(query.timeMin ? { timeMin: query.timeMin } : {}),
        ...(query.timeMax ? { timeMax: query.timeMax } : {}),
      });

      return response.data.items ?? [];
    } catch (error: unknown) {
      this.throwGoogleApiError(error);
    }
  }

  async createEvent(userId: string, dto: CreateCalendarEventDto) {
    this.validateDateRange(dto.startDateTime, dto.endDateTime);

    const { calendar, calendarId } =
      await this.getAuthenticatedCalendar(userId);

    try {
      const response = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: dto.summary,
          ...(dto.description !== undefined
            ? {
                description: dto.description,
              }
            : {}),
          ...(dto.location !== undefined
            ? {
                location: dto.location,
              }
            : {}),
          start: {
            dateTime: dto.startDateTime,
            ...(dto.timeZone
              ? {
                  timeZone: dto.timeZone,
                }
              : {}),
          },
          end: {
            dateTime: dto.endDateTime,
            ...(dto.timeZone
              ? {
                  timeZone: dto.timeZone,
                }
              : {}),
          },
        },
      });

      return response.data;
    } catch (error: unknown) {
      this.throwGoogleApiError(error);
    }
  }

  async updateEvent(
    userId: string,
    eventId: string,
    dto: UpdateCalendarEventDto,
  ) {
    const hasStart = dto.startDateTime !== undefined;

    const hasEnd = dto.endDateTime !== undefined;

    if (hasStart !== hasEnd) {
      throw new BadRequestException({
        code: ErrorCode.CALENDAR_INVALID_DATE_RANGE,
        message:
          'startDateTime and endDateTime must be provided together when changing event time.',
      });
    }

    if (dto.timeZone !== undefined && !hasStart) {
      throw new BadRequestException({
        code: ErrorCode.CALENDAR_INVALID_DATE_RANGE,
        message:
          'timeZone can only be changed together with startDateTime and endDateTime.',
      });
    }

    if (dto.startDateTime && dto.endDateTime) {
      this.validateDateRange(dto.startDateTime, dto.endDateTime);
    }

    const { calendar, calendarId } =
      await this.getAuthenticatedCalendar(userId);

    try {
      const response = await calendar.events.patch({
        calendarId,
        eventId,
        requestBody: {
          ...(dto.summary !== undefined
            ? {
                summary: dto.summary,
              }
            : {}),
          ...(dto.description !== undefined
            ? {
                description: dto.description,
              }
            : {}),
          ...(dto.location !== undefined
            ? {
                location: dto.location,
              }
            : {}),
          ...(dto.startDateTime && dto.endDateTime
            ? {
                start: {
                  dateTime: dto.startDateTime,
                  ...(dto.timeZone
                    ? {
                        timeZone: dto.timeZone,
                      }
                    : {}),
                },
                end: {
                  dateTime: dto.endDateTime,
                  ...(dto.timeZone
                    ? {
                        timeZone: dto.timeZone,
                      }
                    : {}),
                },
              }
            : {}),
        },
      });

      return response.data;
    } catch (error: unknown) {
      this.throwGoogleApiError(error);
    }
  }

  async deleteEvent(userId: string, eventId: string) {
    const { calendar, calendarId } =
      await this.getAuthenticatedCalendar(userId);

    try {
      await calendar.events.delete({
        calendarId,
        eventId,
      });

      return {
        deleted: true,
      };
    } catch (error: unknown) {
      this.throwGoogleApiError(error);
    }
  }

  private async verifyOAuthState(state: string): Promise<CalendarOAuthState> {
    try {
      const payload = await this.jwtService.verifyAsync<CalendarOAuthState>(
        state,
        {
          secret: this.configService.getOrThrow<string>(
            'GOOGLE_CALENDAR_STATE_SECRET',
          ),
        },
      );

      if (
        !payload.sub ||
        !payload.nonce ||
        payload.purpose !== 'google-calendar'
      ) {
        throw new Error('Invalid OAuth state payload.');
      }

      return payload;
    } catch {
      throw new BadRequestException({
        code: ErrorCode.CALENDAR_INVALID_STATE,
        message: 'Google Calendar authorization state is invalid or expired.',
      });
    }
  }

  private async getAuthenticatedCalendar(userId: string) {
    const connection = await this.connections.findByUserId(userId);

    if (!connection) {
      throw new UnauthorizedException({
        code: ErrorCode.CALENDAR_NOT_CONNECTED,
        message: 'Google Calendar is not connected for this user.',
      });
    }

    const refreshToken = this.decryptRefreshToken(connection);

    return {
      calendar: this.googleCalendarClient.createCalendar(refreshToken),
      calendarId: connection.calendarId,
    };
  }

  private decryptRefreshToken(connection: {
    encryptedRefreshToken: string;
    tokenIv: string;
    tokenAuthTag: string;
  }): string {
    return this.tokenEncryption.decrypt(
      connection.encryptedRefreshToken,
      connection.tokenIv,
      connection.tokenAuthTag,
    );
  }

  private validateOptionalDateRange(
    startDateTime?: string,
    endDateTime?: string,
  ): void {
    if (startDateTime && endDateTime) {
      this.validateDateRange(startDateTime, endDateTime);
    }
  }

  private validateDateRange(startDateTime: string, endDateTime: string): void {
    const start = new Date(startDateTime);

    const end = new Date(endDateTime);

    if (start >= end) {
      throw new BadRequestException({
        code: ErrorCode.CALENDAR_INVALID_DATE_RANGE,
        message: 'endDateTime must be later than startDateTime.',
      });
    }
  }

  private throwGoogleApiError(error: unknown): never {
    const googleError = error as GoogleApiErrorShape;

    const status = googleError.response?.status;

    const errorCode = googleError.response?.data?.error;

    const message = googleError.message ?? '';

    if (
      status === 401 ||
      errorCode === 'invalid_grant' ||
      message.includes('invalid_grant')
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.CALENDAR_REAUTH_REQUIRED,
        message:
          'Google Calendar authorization has expired or been revoked. Reconnect your calendar.',
      });
    }

    if (status === 403) {
      throw new ForbiddenException({
        code: ErrorCode.CALENDAR_PERMISSION_DENIED,
        message:
          'Google Calendar permission is insufficient for this operation.',
      });
    }

    if (status === 404) {
      throw new NotFoundException({
        code: ErrorCode.CALENDAR_EVENT_NOT_FOUND,
        message: 'Google Calendar event was not found.',
      });
    }

    throw new BadGatewayException({
      code: ErrorCode.CALENDAR_GOOGLE_API_ERROR,
      message: 'Google Calendar API request failed.',
    });
  }
}
