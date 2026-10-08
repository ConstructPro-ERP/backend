import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

const CALENDAR_SCOPE =
  process.env.CALENDAR_SCOPE ||
  'https://www.googleapis.com/auth/calendar.events.owned';

@Injectable()
export class GoogleCalendarClient {
  constructor(private readonly configService: ConfigService) {}

  createOAuthClient() {
    return new google.auth.OAuth2(
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.getOrThrow<string>('GOOGLE_CALENDAR_CALLBACK_URL'),
    );
  }

  generateAuthorizationUrl(state: string): string {
    const client = this.createOAuthClient();

    return client.generateAuthUrl({
      access_type: 'offline',
      include_granted_scopes: true,
      prompt: 'consent',
      scope: [CALENDAR_SCOPE],
      state,
    });
  }

  async exchangeCode(code: string) {
    const client = this.createOAuthClient();

    const { tokens } = await client.getToken(code);

    return tokens;
  }

  createCalendar(refreshToken: string) {
    const client = this.createOAuthClient();

    client.setCredentials({
      refresh_token: refreshToken,
    });

    return google.calendar({
      version: 'v3',
      auth: client,
    });
  }

  async revokeToken(refreshToken: string): Promise<void> {
    const client = this.createOAuthClient();

    await client.revokeToken(refreshToken);
  }
}
