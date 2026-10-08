import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AxiosResponse } from 'axios';
import type { CookieOptions, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { firstValueFrom, type Observable } from 'rxjs';
import { CalendarEventsQueryDto } from '../../../calendar-service/src/dto/calendar-events-query.dto';
import { CreateCalendarEventDto } from '../../../calendar-service/src/dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from '../../../calendar-service/src/dto/update-calendar-event.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

const CALENDAR_STATE_COOKIE = 'constructpro_calendar_oauth_state';

interface CookieRequest extends Request {
  cookies: Record<string, string | undefined>;
}

interface CalendarConnectResponse {
  authorizationUrl: string;
  state: string;
}

interface DownstreamError {
  code?: string;
  message?: string;
  details?: unknown;
}

interface AxiosErrorShape {
  response?: {
    status?: number;
    data?: DownstreamError;
  };
}

@ApiTags('Google Calendar')
@Controller('calendar')
export class CalendarGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post('connect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start Google Calendar authorization',
  })
  async connect(
    @Req() req: Request,
    @Res({ passthrough: true })
    res: Response,
  ) {
    const result = await this.forward<CalendarConnectResponse>(() =>
      this.httpService.post(
        this.url('/calendar/connect'),
        {},
        {
          headers: this.authorizationHeaders(req),
        },
      ),
    );

    res.cookie(CALENDAR_STATE_COOKIE, result.state, this.oauthCookieOptions());

    return {
      authorizationUrl: result.authorizationUrl,
    };
  }

  @Get('oauth/callback')
  @ApiOperation({
    summary: 'Google Calendar OAuth callback',
  })
  async callback(
    @Req() req: CookieRequest,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') oauthError?: string,
  ) {
    const storedState = req.cookies[CALENDAR_STATE_COOKIE];

    if (!state || !storedState || !this.statesMatch(state, storedState)) {
      this.clearOAuthCookie(res);

      return res.redirect(this.frontendRedirectUrl('error'));
    }

    try {
      await this.forward(() =>
        this.httpService.get(this.url('/calendar/oauth/callback'), {
          params: {
            ...(code ? { code } : {}),
            ...(state ? { state } : {}),
            ...(oauthError
              ? {
                  error: oauthError,
                }
              : {}),
          },
        }),
      );

      this.clearOAuthCookie(res);

      return res.redirect(this.frontendRedirectUrl('connected'));
    } catch {
      this.clearOAuthCookie(res);

      return res.redirect(this.frontendRedirectUrl('error'));
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get Google Calendar connection status',
  })
  status(@Req() req: Request) {
    return this.forward(() =>
      this.httpService.get(this.url('/calendar/status'), {
        headers: this.authorizationHeaders(req),
      }),
    );
  }

  @Delete('connection')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Disconnect Google Calendar',
  })
  disconnect(@Req() req: Request) {
    return this.forward(() =>
      this.httpService.delete(this.url('/calendar/connection'), {
        headers: this.authorizationHeaders(req),
      }),
    );
  }

  @Get('events')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List Google Calendar events',
  })
  listEvents(
    @Req() req: Request,
    @Query()
    query: CalendarEventsQueryDto,
  ) {
    return this.forward(() =>
      this.httpService.get(this.url('/calendar/events'), {
        headers: this.authorizationHeaders(req),
        params: query,
      }),
    );
  }

  @Post('events')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a Google Calendar event',
  })
  createEvent(
    @Req() req: Request,
    @Body()
    body: CreateCalendarEventDto,
  ) {
    return this.forward(() =>
      this.httpService.post(this.url('/calendar/events'), body, {
        headers: this.authorizationHeaders(req),
      }),
    );
  }

  @Patch('events/:eventId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a Google Calendar event',
  })
  updateEvent(
    @Req() req: Request,
    @Param('eventId')
    eventId: string,
    @Body()
    body: UpdateCalendarEventDto,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/calendar/events/${eventId}`), body, {
        headers: this.authorizationHeaders(req),
      }),
    );
  }

  @Delete('events/:eventId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a Google Calendar event',
  })
  deleteEvent(
    @Req() req: Request,
    @Param('eventId')
    eventId: string,
  ) {
    return this.forward(() =>
      this.httpService.delete(this.url(`/calendar/events/${eventId}`), {
        headers: this.authorizationHeaders(req),
      }),
    );
  }

  private url(path: string): string {
    const base = process.env.CALENDAR_SERVICE_URL ?? 'http://localhost:4013';

    return `${base}${path}`;
  }

  private authorizationHeaders(req: Request) {
    const authorization = req.headers.authorization;

    return authorization ? { authorization } : {};
  }

  private oauthCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/api/calendar/oauth/callback',
    };
  }

  private clearOAuthCookie(res: Response): void {
    res.clearCookie(CALENDAR_STATE_COOKIE, {
      ...this.oauthCookieOptions(),
      maxAge: undefined,
    });
  }

  private statesMatch(received: string, expected: string): boolean {
    const receivedBuffer = Buffer.from(received);

    const expectedBuffer = Buffer.from(expected);

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(receivedBuffer, expectedBuffer);
  }

  private frontendRedirectUrl(result: 'connected' | 'error'): string {
    const frontendUrl = (
      process.env.FRONTEND_URL ?? 'http://localhost:5173'
    ).replace(/\/$/, '');

    return `${frontendUrl}/settings/integrations?calendar=${result}`;
  }

  private async forward<T = unknown>(
    call: () => Observable<AxiosResponse<T>>,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(call());

      return response.data;
    } catch (error: unknown) {
      const downstream = (error as AxiosErrorShape).response;

      if (downstream?.status && downstream.data) {
        throw new HttpException(downstream.data, downstream.status);
      }

      throw new HttpException(
        {
          code: 'CALENDAR_SERVICE_UNAVAILABLE',
          message: 'Calendar service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
