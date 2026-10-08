import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProjectController } from './project.controller';
import { ProjectRepository } from './repositories/project.repository';
import { ProjectService } from './project.service';
import { ProjectAccessService } from './project-access.service';
import { ProjectLifecycleService } from './lifecycle/project-lifecycle.service';
import { MilestoneRepository } from './repositories/milestone.repository';
import { MilestoneService } from './milestone.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
  ],
  controllers: [ProjectController],
  providers: [
    ProjectService,
    MilestoneService,
    ProjectAccessService,
    ProjectLifecycleService,
    ProjectRepository,
    MilestoneRepository,
    PrismaService,
  ],
})
export class ProjectModule {}
