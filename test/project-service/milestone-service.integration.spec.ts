import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { ProjectModule } from '../../apps/project-service/src/project.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../shared/error-codes';

jest.setTimeout(30000);

describe('Milestone deletion — database integration', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let managerId: string;

  const runId = `${Date.now()}-${process.pid}`;
  const projectIds: string[] = [];

  async function createProject() {
    const project = await prisma.project.create({
      data: {
        projectName: `Milestone Integration ${runId}`,
        projectManagerId: managerId,
        startDate: new Date('2026-10-01T00:00:00Z'),
        status: ProjectStatus.PLANNING,
      },
    });

    projectIds.push(project.id);
    return project;
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ProjectModule],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);

    const role = await prisma.role.upsert({
      where: { roleName: 'PROJECT_MANAGER' },
      update: {},
      create: { roleName: 'PROJECT_MANAGER' },
    });

    const manager = await prisma.user.create({
      data: {
        fullName: `Milestone Test Manager ${runId}`,
        email: `milestone-integration-${runId}@test.com`,
        password: 'hashed',
        roleId: role.id,
      },
    });

    managerId = manager.id;

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    if (projectIds.length === 0) return;

    await prisma.task.deleteMany({
      where: { projectId: { in: projectIds } },
    });

    await prisma.milestone.deleteMany({
      where: { projectId: { in: projectIds } },
    });

    await prisma.project.deleteMany({
      where: { id: { in: projectIds } },
    });

    projectIds.length = 0;
  });

  afterAll(async () => {
    await prisma.user.delete({
      where: { id: managerId },
    });

    await app.close();
  });

  it('enforces the task foreign key at database level', async () => {
    const project = await createProject();

    const milestone = await prisma.milestone.create({
      data: {
        projectId: project.id,
        milestoneName: 'Foundation',
        weight: 5,
      },
    });

    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        milestoneId: milestone.id,
        taskName: 'Foundation Work',
      },
    });

    await expect(
      prisma.milestone.delete({
        where: { id: milestone.id },
      }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });

    const savedMilestone = await prisma.milestone.findUnique({
      where: { id: milestone.id },
    });

    const savedTask = await prisma.task.findUnique({
      where: { id: task.id },
    });

    expect(savedMilestone).not.toBeNull();
    expect(savedTask?.milestoneId).toBe(milestone.id);
  });

  it('rejects deletion with tasks and recalculates after detachment', async () => {
    const project = await createProject();

    const firstResponse = await request(server)
      .post(`/projects/${project.id}/milestones`)
      .set('x-user-id', managerId)
      .send({
        milestoneName: 'Foundation',
        weight: 5,
        progressPercentage: 100,
      })
      .expect(201);

    const first = firstResponse.body as { id: string };

    await request(server)
      .post(`/projects/${project.id}/milestones`)
      .set('x-user-id', managerId)
      .send({
        milestoneName: 'Finishing',
        weight: 5,
        progressPercentage: 50,
      })
      .expect(201);

    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        milestoneId: first.id,
        taskName: 'Foundation Work',
      },
    });

    const blocked = await request(server)
      .delete(`/milestones/${first.id}`)
      .set('x-user-id', managerId)
      .expect(409);

    expect((blocked.body as { code: string }).code).toBe(
      ErrorCode.MILESTONE_IN_USE,
    );

    const unchangedProject = await prisma.project.findUnique({
      where: { id: project.id },
    });

    expect(unchangedProject?.progressPercentage).toBe(75);

    expect(
      await prisma.milestone.findUnique({
        where: { id: first.id },
      }),
    ).not.toBeNull();

    expect(
      (
        await prisma.task.findUnique({
          where: { id: task.id },
        })
      )?.milestoneId,
    ).toBe(first.id);

    // Detach the task and retry deletion.
    await prisma.task.update({
      where: { id: task.id },
      data: { milestoneId: null },
    });

    await request(server)
      .delete(`/milestones/${first.id}`)
      .set('x-user-id', managerId)
      .expect(200);

    const updatedProject = await prisma.project.findUnique({
      where: { id: project.id },
    });

    expect(updatedProject?.progressPercentage).toBe(50);

    expect(
      await prisma.milestone.findUnique({
        where: { id: first.id },
      }),
    ).toBeNull();

    const remainingTask = await prisma.task.findUnique({
      where: { id: task.id },
    });

    expect(remainingTask?.milestoneId).toBeNull();
  });
});
