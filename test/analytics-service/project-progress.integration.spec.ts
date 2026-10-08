import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MilestoneStatus, ProjectStatus, TaskStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AnalyticsModule } from '../../apps/analytics-service/src/analytics.module';
import { ProjectModule } from '../../apps/project-service/src/project.module';
import { PrismaService } from '../../prisma/prisma.service';

jest.setTimeout(30000);

type CompletionMilestone = {
  id: string;
  completionPercentage: number;
  taskCount: number;
  completedTaskCount: number;
};

type CompletionItem = {
  projectId: string;
  completionPercentage: number;
  milestoneCount: number;
  completedMilestoneCount: number;
  milestones: CompletionMilestone[];
};

type CompletionReport = {
  total: number;
  items: CompletionItem[];
};

describe('Project Analytics — real weighted progress integration', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let managerId: string;

  const runId = `${Date.now()}-${process.pid}-analytics-progress`;
  const projectIds: string[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ProjectModule, AnalyticsModule],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);

    const role = await prisma.role.upsert({
      where: { roleName: 'PROJECT_MANAGER' },
      update: {},
      create: { roleName: 'PROJECT_MANAGER' },
    });

    const user = await prisma.user.create({
      data: {
        fullName: `Analytics Progress ${runId}`,
        email: `${runId}@test.com`,
        password: 'hashed',
        roleId: role.id,
      },
    });

    managerId = user.id;

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    if (projectIds.length === 0) return;

    const projectId = { in: projectIds };

    await prisma.task.deleteMany({
      where: { projectId },
    });

    await prisma.milestone.deleteMany({
      where: { projectId },
    });

    await prisma.project.deleteMany({
      where: { id: projectId },
    });

    projectIds.length = 0;
  });

  afterAll(async () => {
    await prisma.user.delete({
      where: { id: managerId },
    });

    await app.close();
  });

  async function createProject(label: string) {
    const item = await prisma.project.create({
      data: {
        projectName: `Analytics Progress ${runId} ${label}`,
        projectManagerId: managerId,
        status: ProjectStatus.ACTIVE,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
      },
    });

    projectIds.push(item.id);
    return item;
  }

  async function createMilestone(
    projectId: string,
    name: string,
    weight: number,
    progressPercentage: number,
  ): Promise<string> {
    const response = await request(server)
      .post(`/projects/${projectId}/milestones`)
      .set('x-user-id', managerId)
      .send({
        milestoneName: name,
        weight,
        progressPercentage,
      })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  async function reportForManager(): Promise<CompletionReport> {
    const response = await request(server)
      .get('/analytics/reports/project-completion')
      .query({ projectManagerId: managerId })
      .expect(200);

    return response.body as CompletionReport;
  }

  it('returns stored weighted progress independently of task completion', async () => {
    const project = await createProject('weighted');

    const foundation = await createMilestone(project.id, 'Foundation', 5, 100);

    const finishing = await createMilestone(project.id, 'Finishing', 3, 50);

    const inspection = await createMilestone(project.id, 'Inspection', 2, 0);

    await prisma.task.createMany({
      data: [
        {
          projectId: project.id,
          milestoneId: foundation,
          taskName: 'Not yet completed',
          status: TaskStatus.TODO,
        },
        {
          projectId: project.id,
          milestoneId: finishing,
          taskName: 'Already completed',
          status: TaskStatus.COMPLETED,
        },
      ],
    });

    const persisted = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });

    // (5 * 100 + 3 * 50 + 2 * 0) / 10 = 65
    expect(persisted.progressPercentage).toBeCloseTo(65, 8);

    const report = await reportForManager();

    expect(report.total).toBe(1);
    expect(report.items).toHaveLength(1);

    const item = report.items[0];

    expect(item.projectId).toBe(project.id);
    expect(item.completionPercentage).toBeCloseTo(65, 8);
    expect(item.milestoneCount).toBe(3);
    expect(item.completedMilestoneCount).toBe(1);

    const milestones = new Map(
      item.milestones.map((milestone) => [milestone.id, milestone]),
    );

    expect(milestones.get(foundation)).toMatchObject({
      completionPercentage: 100,
      taskCount: 1,
      completedTaskCount: 0,
    });

    expect(milestones.get(finishing)).toMatchObject({
      completionPercentage: 50,
      taskCount: 1,
      completedTaskCount: 1,
    });

    expect(milestones.get(inspection)).toMatchObject({
      completionPercentage: 0,
      taskCount: 0,
      completedTaskCount: 0,
    });

    const completedMilestone = await prisma.milestone.findUniqueOrThrow({
      where: { id: foundation },
    });

    expect(completedMilestone.status).toBe(MilestoneStatus.COMPLETED);
  });

  it('reports zero progress when a project has no milestones', async () => {
    const project = await createProject('empty');

    const report = await reportForManager();

    expect(report.total).toBe(1);

    expect(report.items).toEqual([
      expect.objectContaining({
        projectId: project.id,
        completionPercentage: 0,
        milestoneCount: 0,
        completedMilestoneCount: 0,
        milestones: [],
      }),
    ]);
  });

  it('reflects progress updates without changing tasks', async () => {
    const project = await createProject('updates');

    const foundation = await createMilestone(project.id, 'Foundation', 2, 50);

    await createMilestone(project.id, 'Finishing', 3, 0);

    const before = await reportForManager();

    // (2 * 50 + 3 * 0) / 5 = 20
    expect(before.items[0].completionPercentage).toBeCloseTo(20, 8);

    await request(server)
      .patch(`/milestones/${foundation}/progress`)
      .set('x-user-id', managerId)
      .send({ progressPercentage: 100 })
      .expect(200);

    const after = await reportForManager();

    // (2 * 100 + 3 * 0) / 5 = 40
    expect(after.items[0].completionPercentage).toBeCloseTo(40, 8);

    expect(
      after.items[0].milestones.find(
        (milestone) => milestone.id === foundation,
      ),
    ).toMatchObject({
      completionPercentage: 100,
      taskCount: 0,
    });
  });
});
