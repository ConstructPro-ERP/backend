import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorCode } from '../../../shared/error-codes';
import { CalendarService } from './calendar.service';
import { CalendarEventsQueryDto } from './dto/calendar-events-query.dto';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import * as calendarAuthGuard from './guards/calendar-auth.guard';

@ApiTags('Google Calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Check Calendar service health',
  })
  @ApiOkResponse({
    description: 'Calendar service is available',
  })
  getHealth() {
    return this.calendarService.getHealth();
  }

  @Post('connect')
  @UseGuards(calendarAuthGuard.CalendarAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start Google Calendar authorization',
  })
  connect(
    @Req()
    req: calendarAuthGuard.CalendarAuthenticatedRequest,
  ) {
    return this.calendarService.createAuthorization(this.getUserId(req));
  }

  @Get('oauth/callback')
  @ApiOperation({
    summary: 'Handle Google Calendar OAuth callback',
  })
  callback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') oauthError?: string,
  ) {
    if (oauthError) {
      throw new BadRequestException({
        code: ErrorCode.CALENDAR_AUTHORIZATION_DENIED,
        message: 'Google Calendar authorization was denied.',
      });
    }

    if (!code || !state) {
      throw new BadRequestException({
        code: ErrorCode.CALENDAR_AUTHORIZATION_FAILED,
        message: 'OAuth callback is missing the authorization code or state.',
      });
    }

    return this.calendarService.handleOAuthCallback(code, state);
  }

  @Get('status')
  @UseGuards(calendarAuthGuard.CalendarAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get Google Calendar connection status',
  })
  status(
    @Req()
    req: calendarAuthGuard.CalendarAuthenticatedRequest,
  ) {
    return this.calendarService.getConnectionStatus(this.getUserId(req));
  }

  @Delete('connection')
  @UseGuards(calendarAuthGuard.CalendarAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Disconnect Google Calendar',
  })
  disconnect(
    @Req()
    req: calendarAuthGuard.CalendarAuthenticatedRequest,
  ) {
    return this.calendarService.disconnect(this.getUserId(req));
  }

  @Get('events')
  @UseGuards(calendarAuthGuard.CalendarAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List Google Calendar events',
  })
  listEvents(
    @Req()
    req: calendarAuthGuard.CalendarAuthenticatedRequest,
    @Query()
    query: CalendarEventsQueryDto,
  ) {
    return this.calendarService.listEvents(this.getUserId(req), query);
  }

  @Post('events')
  @UseGuards(calendarAuthGuard.CalendarAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a Google Calendar event',
  })
  createEvent(
    @Req()
    req: calendarAuthGuard.CalendarAuthenticatedRequest,
    @Body()
    dto: CreateCalendarEventDto,
  ) {
    return this.calendarService.createEvent(this.getUserId(req), dto);
  }

  @Patch('events/:eventId')
  @UseGuards(calendarAuthGuard.CalendarAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a Google Calendar event',
  })
  updateEvent(
    @Req()
    req: calendarAuthGuard.CalendarAuthenticatedRequest,
    @Param('eventId')
    eventId: string,
    @Body()
    dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.updateEvent(this.getUserId(req), eventId, dto);
  }

  @Delete('events/:eventId')
  @UseGuards(calendarAuthGuard.CalendarAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a Google Calendar event',
  })
  deleteEvent(
    @Req()
    req: calendarAuthGuard.CalendarAuthenticatedRequest,
    @Param('eventId')
    eventId: string,
  ) {
    return this.calendarService.deleteEvent(this.getUserId(req), eventId);
  }

  private getUserId(
    req: calendarAuthGuard.CalendarAuthenticatedRequest,
  ): string {
    if (!req.user?.id) {
      throw new UnauthorizedException({
        code: ErrorCode.CALENDAR_USER_REQUIRED,
        message: 'Authenticated user information is required.',
      });
    }

    return req.user.id;
  }
}
