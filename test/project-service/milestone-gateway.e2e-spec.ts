import { HttpModule } from '@nestjs/axios';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { MilestonesGatewayController } from '../../apps/api-gateway/src/controllers/milestones-gateway.controller';
import { HttpExceptionFilter } from '../../apps/api-gateway/src/filters/http-exception.filter';
import { JwtAuthGuard } from '../../apps/api-gateway/src/guards/jwt-auth.guard';
import { RolesGuard } from '../../apps/api-gateway/src/guards/roles.guard';
import { ResponseInterceptor } from '../../apps/api-gateway/src/interceptors/response.interceptor';
import { ProjectModule } from '../../apps/project-service/src/project.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../shared/error-codes';

jest.setTimeout(30000);

type Actor = {
  id: string;
  role: string;
};

type GatewayBody<T> = {
  success: boolean;
  data: T;
};

describe('Milestones — Gateway to Project Service E2E', () => {
  let projectApp: INestApplication;
  let gatewayApp: INestApplication;
  let gatewayServer: Server;
  let authServer: Server;
  let prisma: PrismaService;
  let managerId: string;

  const runId = `${Date.now()}-${process.pid}-gateway`;
  const projectIds: string[] = [];
  const userIds: string[] = [];
  const identities = new Map<string, Actor>();

  const originalProjectUrl = process.env.PROJECT_SERVICE_URL;
  const originalAuthUrl = process.env.AUTH_SERVICE_URL;

  async function createUser(
    roleName: 'PROJECT_MANAGER' | 'ACCOUNTANT',
    label: string,
  ): Promise<string> {
    const role = await prisma.role.upsert({
      where: { roleName },
      update: {},
      create: { roleName },
    });

    const user = await prisma.user.create({
      data: {
        fullName: `Gateway Milestone ${label}`,
        email: `${runId}-${label}@test.com`,
        password: 'hashed',
        roleId: role.id,
      },
    });

    userIds.push(user.id);
    identities.set(label, {
      id: user.id,
      role: roleName,
    });

    return user.id;
  }

  async function createProject(label: string) {
    const project = await prisma.project.create({
      data: {
        projectName: `Gateway Milestone ${runId} ${label}`,
        projectManagerId: managerId,
        status: ProjectStatus.PLANNING,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
      },
    });

    projectIds.push(project.id);
    return project;
  }

  function token(label: string): string {
    return `Bearer ${label}`;
  }

  beforeAll(async () => {
    // Start the real Project Service.
    const projectModule: TestingModule = await Test.createTestingModule({
      imports: [ProjectModule],
    }).compile();

    prisma = projectModule.get<PrismaService>(PrismaService);

    managerId = await createUser('PROJECT_MANAGER', 'manager');
    await createUser('PROJECT_MANAGER', 'other');
    await createUser('ACCOUNTANT', 'accountant');

    projectApp = projectModule.createNestApplication();

    projectApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await projectApp.listen(0, '127.0.0.1');

    process.env.PROJECT_SERVICE_URL = await projectApp.getUrl();

    // Simulate only Auth Service /auth/me.
    authServer = createServer((req, res) => {
      if (req.url !== '/auth/me') {
        res.writeHead(404);
        res.end();
        return;
      }

      const authorization = req.headers.authorization ?? '';
      const label = authorization.replace(/^Bearer /, '');
      const user = identities.get(label);

      if (!user) {
        res.writeHead(401, {
          'content-type': 'application/json',
        });

        res.end(
          JSON.stringify({
            code: 'TOKEN_INVALID',
          }),
        );

        return;
      }

      res.writeHead(200, {
        'content-type': 'application/json',
      });

      res.end(JSON.stringify(user));
    });

    await new Promise<void>((resolve) => {
      authServer.listen(0, '127.0.0.1', resolve);
    });

    const address = authServer.address();

    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test Auth Service port.');
    }

    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${address.port}`;

    // Start the Gateway with real guards and HTTP forwarding.
    const gatewayModule: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      controllers: [MilestonesGatewayController],
      providers: [JwtAuthGuard, RolesGuard, Reflector],
    }).compile();

    gatewayApp = gatewayModule.createNestApplication();

    // Suppress NestJS error logs during this E2E suite.
    gatewayApp.useLogger(['log', 'warn']);

    gatewayApp.setGlobalPrefix('api');

    gatewayApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    gatewayApp.useGlobalInterceptors(new ResponseInterceptor());
    gatewayApp.useGlobalFilters(new HttpExceptionFilter());

    await gatewayApp.init();

    gatewayServer = gatewayApp.getHttpServer() as Server;
  });

  afterEach(async () => {
    if (projectIds.length === 0) return;

    const filter = { in: projectIds };

    await prisma.task.deleteMany({
      where: { projectId: filter },
    });

    await prisma.milestone.deleteMany({
      where: { projectId: filter },
    });

    await prisma.project.deleteMany({
      where: { id: filter },
    });

    projectIds.length = 0;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        id: { in: userIds },
      },
    });

    await gatewayApp.close();
    await projectApp.close();

    await new Promise<void>((resolve, reject) => {
      authServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    if (originalProjectUrl === undefined) {
      delete process.env.PROJECT_SERVICE_URL;
    } else {
      process.env.PROJECT_SERVICE_URL = originalProjectUrl;
    }

    if (originalAuthUrl === undefined) {
      delete process.env.AUTH_SERVICE_URL;
    } else {
      process.env.AUTH_SERVICE_URL = originalAuthUrl;
    }
  });

  it('creates, updates, reads and deletes through the real Gateway', async () => {
    const project = await createProject('crud');

    const createdResponse = await request(gatewayServer)
      .post(`/api/projects/${project.id}/milestones`)
      .set('authorization', token('manager'))
      .send({
        milestoneName: 'Foundation',
        weight: 5,
      })
      .expect(201);

    const created = createdResponse.body as GatewayBody<{
      id: string;
    }>;

    expect(created.success).toBe(true);

    const milestoneId = created.data.id;

    const updatedResponse = await request(gatewayServer)
      .patch(`/api/milestones/${milestoneId}/progress`)
      .set('authorization', token('manager'))
      .send({ progressPercentage: 70 })
      .expect(200);

    const updated = updatedResponse.body as GatewayBody<{
      progressPercentage: number;
    }>;

    expect(updated.data.progressPercentage).toBe(70);

    const listResponse = await request(gatewayServer)
      .get(`/api/projects/${project.id}/milestones`)
      .set('authorization', token('manager'))
      .expect(200);

    const list = listResponse.body as GatewayBody<
      Array<{
        id: string;
      }>
    >;

    expect(list.data).toEqual([
      expect.objectContaining({
        id: milestoneId,
      }),
    ]);

    const detailResponse = await request(gatewayServer)
      .get(`/api/milestones/${milestoneId}`)
      .set('authorization', token('manager'))
      .expect(200);

    const detail = detailResponse.body as GatewayBody<{
      id: string;
    }>;

    expect(detail.data.id).toBe(milestoneId);

    const savedProject = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });

    expect(savedProject.progressPercentage).toBeCloseTo(70, 8);

    await request(gatewayServer)
      .delete(`/api/milestones/${milestoneId}`)
      .set('authorization', token('manager'))
      .expect(200);

    expect(
      await prisma.milestone.findUnique({
        where: { id: milestoneId },
      }),
    ).toBeNull();

    const finalProject = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });

    expect(finalProject.progressPercentage).toBe(0);
  });

  it('rejects spoofed actors, insufficient roles and missing tokens', async () => {
    const project = await createProject('security');

    // This request claims to be the manager in x-user-id,
    // but the authenticated actor is another manager.
    const spoofedResponse = await request(gatewayServer)
      .post(`/api/projects/${project.id}/milestones`)
      .set('authorization', token('other'))
      .set('x-user-id', managerId)
      .send({
        milestoneName: 'Forbidden',
        weight: 3,
      })
      .expect(403);

    expect((spoofedResponse.body as { success: boolean }).success).toBe(false);

    expect(
      await prisma.milestone.count({
        where: { projectId: project.id },
      }),
    ).toBe(0);

    // Accountant has read permission.
    await request(gatewayServer)
      .get(`/api/projects/${project.id}/milestones`)
      .set('authorization', token('accountant'))
      .expect(200);

    // Accountant cannot create milestones.
    await request(gatewayServer)
      .post(`/api/projects/${project.id}/milestones`)
      .set('authorization', token('accountant'))
      .send({
        milestoneName: 'Forbidden',
        weight: 3,
      })
      .expect(403);

    const missingResponse = await request(gatewayServer)
      .get(`/api/projects/${project.id}/milestones`)
      .expect(401);

    expect((missingResponse.body as { code: string }).code).toBe(
      ErrorCode.TOKEN_MISSING,
    );
  });

  it('preserves milestone deletion conflicts across services', async () => {
    const project = await createProject('linked-task');

    const createdResponse = await request(gatewayServer)
      .post(`/api/projects/${project.id}/milestones`)
      .set('authorization', token('manager'))
      .send({
        milestoneName: 'Foundation',
        weight: 5,
      })
      .expect(201);

    const milestoneId = (createdResponse.body as GatewayBody<{ id: string }>)
      .data.id;

    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        milestoneId,
        taskName: 'Assigned Task',
      },
    });

    const response = await request(gatewayServer)
      .delete(`/api/milestones/${milestoneId}`)
      .set('authorization', token('manager'))
      .expect(409);

    expect((response.body as { code: string }).code).toBe(
      ErrorCode.MILESTONE_IN_USE,
    );

    const persistedTask = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
    });

    expect(persistedTask.milestoneId).toBe(milestoneId);

    expect(
      await prisma.milestone.findUnique({
        where: { id: milestoneId },
      }),
    ).not.toBeNull();
  });
});
