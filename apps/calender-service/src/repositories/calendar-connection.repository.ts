import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface SaveCalendarConnectionInput {
  encryptedRefreshToken: string;
  tokenIv: string;
  tokenAuthTag: string;
  scope: string | null;
  calendarId: string;
}

@Injectable()
export class CalendarConnectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string) {
    return this.prisma.googleCalendarConnection.findUnique({
      where: {
        userId,
      },
    });
  }

  upsert(userId: string, data: SaveCalendarConnectionInput) {
    return this.prisma.googleCalendarConnection.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        ...data,
      },
      update: {
        ...data,
        connectedAt: new Date(),
      },
    });
  }

  deleteByUserId(userId: string) {
    return this.prisma.googleCalendarConnection.deleteMany({
      where: {
        userId,
      },
    });
  }
}
