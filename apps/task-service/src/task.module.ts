import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { PrismaService } from '../../../prisma/prisma.service';
import { TaskController } from './task.controller';
import { TaskRepository } from './repositories/task.repository';
import { TaskService } from './task.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
  ],
  controllers: [TaskController],
  providers: [TaskService, TaskRepository, PrismaService],
})
export class TaskModule {}
