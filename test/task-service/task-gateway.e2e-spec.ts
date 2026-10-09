import { HttpModule } from '@nestjs/axios';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectStatus, TaskStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { TasksGatewayController } from '../../apps/api-gateway/src/controllers/tasks-gateway.controller';
import { HttpExceptionFilter } from '../../apps/api-gateway/src/filters/http-exception.filter';
import { JwtAuthGuard } from '../../apps/api-gateway/src/guards/jwt-auth.guard';
import { RolesGuard } from '../../apps/api-gateway/src/guards/roles.guard';
import { ResponseInterceptor } from '../../apps/api-gateway/src/interceptors/response.interceptor';
import { TaskModule } from '../../apps/task-service/src/task.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../shared/error-codes';

jest.setTimeout(60000);

type ActorRole = 'ADMIN' | 'PROJECT_MANAGER' | 'ACCOUNTANT';

type Actor = {
  id: string;
  role: ActorRole;
};

type GatewayBody<T> = {
  success: boolean;
  data: T;
};

describe('Tasks — Gateway to Task Service E2E', () => {
  let taskApp: INestApplication;
  let gatewayApp: INestApplication;
  let gatewayServer: Server;
  let authServer: Server;
  let prisma: PrismaService;

  let managerId: string;
  let otherManagerId: string;

  const runId = `${Date.now()}-${process.pid}-${randomUUID()}`;
  const userIds: string[] = [];
  const projectIds: string[] = [];
  const identities = new Map<string, Actor>();

  const originalTaskUrl = process.env.TASK_SERVICE_URL;
  const originalAuthUrl = process.env.AUTH_SERVICE_URL;

  function token(label: string): string {
    return `Bearer ${label}`;
  }

  async function createProject(projectManagerId = managerId) {
    const project = await prisma.project.create({
      data: {
        projectName: `Task Gateway E2E ${runId}`,
        projectManagerId,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T23:59:59.999Z'),
        status: ProjectStatus.PLANNING,
      },
    });

    projectIds.push(project.id);
    return project;
  }

  beforeAll(async () => {
    // Start the real Task Service with its existing configuration.
    const taskModule = await Test.createTestingModule({
      imports: [TaskModule],
    }).compile();

    prisma = taskModule.get<PrismaService>(PrismaService);

    const [managerRole, adminRole, accountantRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: { roleName: 'PROJECT_MANAGER' },
      }),
      prisma.role.findUniqueOrThrow({
        where: { roleName: 'ADMIN' },
      }),
      prisma.role.findUniqueOrThrow({
        where: { roleName: 'ACCOUNTANT' },
      }),
    ]);

    async function createUser(
      label: string,
      role: ActorRole,
      roleId: string,
    ): Promise<string> {
      const user = await prisma.user.create({
        data: {
          fullName: `Task Gateway ${label}`,
          email: `task-${label}-${runId}@example.test`,
          password: 'hashed',
          roleId,
        },
      });

      userIds.push(user.id);
      identities.set(label, { id: user.id, role });

      return user.id;
    }

    managerId = await createUser('manager', 'PROJECT_MANAGER', managerRole.id);

    otherManagerId = await createUser(
      'other',
      'PROJECT_MANAGER',
      managerRole.id,
    );

    await createUser('accountant', 'ACCOUNTANT', accountantRole.id);

    await createUser('admin', 'ADMIN', adminRole.id);

    taskApp = taskModule.createNestApplication();

    taskApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await taskApp.listen(0, '127.0.0.1');
    process.env.TASK_SERVICE_URL = await taskApp.getUrl();

    // Simulate only Auth Service /auth/me.
    // The Gateway JWT guard itself remains real.
    authServer = createServer((req, res) => {
      if (req.url !== '/auth/me') {
        res.writeHead(404);
        res.end();
        return;
      }

      const authorization = req.headers.authorization ?? '';
      const label = authorization.replace(/^Bearer /, '');
      const actor = identities.get(label);

      if (!actor) {
        res.writeHead(401, {
          'content-type': 'application/json',
        });
        res.end(JSON.stringify({ code: 'TOKEN_INVALID' }));
        return;
      }

      res.writeHead(200, {
        'content-type': 'application/json',
      });
      res.end(JSON.stringify(actor));
    });

    await new Promise<void>((resolve) => {
      authServer.listen(0, '127.0.0.1', resolve);
    });

    const address = authServer.address();

    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test Auth Service port.');
    }

    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${address.port}`;

    // Start the real Gateway controllers and guards.
    const gatewayModule = await Test.createTestingModule({
      imports: [HttpModule],
      controllers: [TasksGatewayController],
      providers: [JwtAuthGuard, RolesGuard, Reflector],
    }).compile();

    gatewayApp = gatewayModule.createNestApplication();
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

    // Remove child records before deleting their projects.
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
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });

    await gatewayApp.close();
    await taskApp.close();

    await new Promise<void>((resolve, reject) => {
      authServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    if (originalTaskUrl === undefined) {
      delete process.env.TASK_SERVICE_URL;
    } else {
      process.env.TASK_SERVICE_URL = originalTaskUrl;
    }

    if (originalAuthUrl === undefined) {
      delete process.env.AUTH_SERVICE_URL;
    } else {
      process.env.AUTH_SERVICE_URL = originalAuthUrl;
    }
  });

  it('completes the task workflow without changing project progress', async () => {
    const project = await createProject();

    const milestone = await prisma.milestone.create({
      data: {
        projectId: project.id,
        milestoneName: 'Foundation',
        weight: 5,
        progressPercentage: 40,
        status: 'IN_PROGRESS',
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { progressPercentage: 40 },
    });

    // POST /tasks — create a project-level task.
    const plainResponse = await request(gatewayServer)
      .post('/api/tasks')
      .set('authorization', token('manager'))
      .send({
        projectId: project.id,
        taskName: 'Order materials',
      })
      .expect(201);

    const plain = plainResponse.body as GatewayBody<{
      id: string;
      milestoneId: string | null;
    }>;

    expect(plain.success).toBe(true);
    expect(plain.data.milestoneId).toBeNull();

    // POST /tasks — create a milestone-linked task.
    const linkedResponse = await request(gatewayServer)
      .post('/api/tasks')
      .set('authorization', token('manager'))
      .send({
        projectId: project.id,
        milestoneId: milestone.id,
        taskName: 'Prepare foundation',
        dueDate: '2026-11-01T00:00:00.000Z',
      })
      .expect(201);

    const linked = linkedResponse.body as GatewayBody<{
      id: string;
      milestoneId: string | null;
    }>;

    const taskId = linked.data.id;
    expect(linked.data.milestoneId).toBe(milestone.id);

    // GET /tasks/:id
    const detailResponse = await request(gatewayServer)
      .get(`/api/tasks/${taskId}`)
      .set('authorization', token('manager'))
      .expect(200);

    const detail = detailResponse.body as GatewayBody<{
      id: string;
      taskName: string;
    }>;

    expect(detail.data.id).toBe(taskId);
    expect(detail.data.taskName).toBe('Prepare foundation');

    // PATCH /tasks/:id/assign — assignment and reassignment.
    await request(gatewayServer)
      .patch(`/api/tasks/${taskId}/assign`)
      .set('authorization', token('manager'))
      .send({ assignedToId: otherManagerId })
      .expect(200);

    await request(gatewayServer)
      .patch(`/api/tasks/${taskId}/assign`)
      .set('authorization', token('manager'))
      .send({ assignedToId: managerId })
      .expect(200);

    // PATCH /tasks/:id — update metadata.
    await request(gatewayServer)
      .patch(`/api/tasks/${taskId}`)
      .set('authorization', token('manager'))
      .send({
        description: 'Updated foundation preparation',
      })
      .expect(200);

    // PATCH /tasks/:id/status — complete the task.
    await request(gatewayServer)
      .patch(`/api/tasks/${taskId}/status`)
      .set('authorization', token('manager'))
      .send({ status: TaskStatus.COMPLETED })
      .expect(200);

    // GET /tasks — list using filters.
    const allResponse = await request(gatewayServer)
      .get('/api/tasks')
      .set('authorization', token('manager'))
      .query({
        projectId: project.id,
        status: TaskStatus.COMPLETED,
        page: 1,
        limit: 10,
      })
      .expect(200);

    const all = allResponse.body as GatewayBody<{
      data: Array<{ id: string }>;
      meta: { total: number };
    }>;

    expect(all.data.meta.total).toBe(1);
    expect(all.data.data.map((item) => item.id)).toEqual([taskId]);

    // GET /projects/:projectId/tasks — project-scoped listing.
    const listResponse = await request(gatewayServer)
      .get(`/api/projects/${project.id}/tasks`)
      .set('authorization', token('manager'))
      .query({
        milestoneId: milestone.id,
        status: TaskStatus.COMPLETED,
        page: 1,
        limit: 10,
      })
      .expect(200);

    const list = listResponse.body as GatewayBody<{
      data: Array<{
        id: string;
        status: TaskStatus;
      }>;
      meta: { total: number };
    }>;

    expect(list.data.data).toHaveLength(1);
    expect(list.data.data[0]).toMatchObject({
      id: taskId,
      status: TaskStatus.COMPLETED,
    });
    expect(list.data.meta.total).toBe(1);

    // Verify actual persistence and unchanged weighted progress.
    const [storedTask, storedMilestone, storedProject] = await Promise.all([
      prisma.task.findUniqueOrThrow({
        where: { id: taskId },
      }),
      prisma.milestone.findUniqueOrThrow({
        where: { id: milestone.id },
      }),
      prisma.project.findUniqueOrThrow({
        where: { id: project.id },
      }),
    ]);

    expect(storedTask.status).toBe(TaskStatus.COMPLETED);
    expect(storedTask.assignedToId).toBe(managerId);
    expect(storedTask.description).toBe('Updated foundation preparation');
    expect(storedMilestone.progressPercentage).toBe(40);
    expect(storedProject.progressPercentage).toBe(40);

    // DELETE /tasks/:id
    for (const id of [taskId, plain.data.id]) {
      await request(gatewayServer)
        .delete(`/api/tasks/${id}`)
        .set('authorization', token('manager'))
        .expect(200);
    }

    expect(
      await prisma.task.count({
        where: { projectId: project.id },
      }),
    ).toBe(0);
  });

  it('enforces JWT roles and project ownership', async () => {
    const project = await createProject();

    // An unrelated Project Manager cannot create tasks,
    // even if the request includes a forged x-user-id.
    const deniedResponse = await request(gatewayServer)
      .post('/api/tasks')
      .set('authorization', token('other'))
      .set('x-user-id', managerId)
      .send({
        projectId: project.id,
        taskName: 'Unauthorized task',
      })
      .expect(403);

    expect((deniedResponse.body as { code: string }).code).toBe(
      ErrorCode.PROJECT_ACCESS_DENIED,
    );

    // ACCOUNTANT may read tasks.
    await request(gatewayServer)
      .get(`/api/projects/${project.id}/tasks`)
      .set('authorization', token('accountant'))
      .expect(200);

    // ACCOUNTANT may not create tasks.
    await request(gatewayServer)
      .post('/api/tasks')
      .set('authorization', token('accountant'))
      .send({
        projectId: project.id,
        taskName: 'Accountant task',
      })
      .expect(403);

    // ADMIN may read and create tasks.
    await request(gatewayServer)
      .post('/api/tasks')
      .set('authorization', token('admin'))
      .send({
        projectId: project.id,
        taskName: 'Admin task',
      })
      .expect(201);

    // Requests without a JWT are rejected at the Gateway.
    const missingResponse = await request(gatewayServer)
      .get(`/api/projects/${project.id}/tasks`)
      .expect(401);

    expect((missingResponse.body as { code: string }).code).toBe(
      ErrorCode.TOKEN_MISSING,
    );

    expect(
      await prisma.task.count({
        where: { projectId: project.id },
      }),
    ).toBe(1);
  });

  it('rejects invalid milestones, assignees, and due dates', async () => {
    const project = await createProject();
    const otherProject = await createProject();

    const foreignMilestone = await prisma.milestone.create({
      data: {
        projectId: otherProject.id,
        milestoneName: 'Other project milestone',
        weight: 5,
      },
    });

    // Milestone must belong to the selected project.
    const mismatchResponse = await request(gatewayServer)
      .post('/api/tasks')
      .set('authorization', token('manager'))
      .send({
        projectId: project.id,
        milestoneId: foreignMilestone.id,
        taskName: 'Invalid milestone',
      })
      .expect(400);

    expect((mismatchResponse.body as { code: string }).code).toBe(
      ErrorCode.TASK_MILESTONE_PROJECT_MISMATCH,
    );

    // Assignee must exist and be active.
    const invalidAssigneeResponse = await request(gatewayServer)
      .post('/api/tasks')
      .set('authorization', token('manager'))
      .send({
        projectId: project.id,
        taskName: 'Invalid assignee',
        assignedToId: randomUUID(),
      })
      .expect(400);

    expect((invalidAssigneeResponse.body as { code: string }).code).toBe(
      ErrorCode.INVALID_TASK_ASSIGNEE,
    );

    // Due date must fall within the project schedule.
    const invalidDateResponse = await request(gatewayServer)
      .post('/api/tasks')
      .set('authorization', token('manager'))
      .send({
        projectId: project.id,
        taskName: 'Invalid due date',
        dueDate: '2027-01-01T00:00:00.000Z',
      })
      .expect(400);

    expect((invalidDateResponse.body as { code: string }).code).toBe(
      ErrorCode.INVALID_TASK_DUE_DATE,
    );

    expect(
      await prisma.task.count({
        where: { projectId: project.id },
      }),
    ).toBe(0);
  });

  it('prevents task modification after project completion', async () => {
    const project = await createProject();

    const createdResponse = await request(gatewayServer)
      .post('/api/tasks')
      .set('authorization', token('manager'))
      .send({
        projectId: project.id,
        taskName: 'Final checks',
      })
      .expect(201);

    const created = createdResponse.body as GatewayBody<{
      id: string;
    }>;

    await prisma.project.update({
      where: { id: project.id },
      data: { status: ProjectStatus.COMPLETED },
    });

    const conflictResponse = await request(gatewayServer)
      .patch(`/api/tasks/${created.data.id}/status`)
      .set('authorization', token('manager'))
      .send({ status: TaskStatus.COMPLETED })
      .expect(409);

    expect((conflictResponse.body as { code: string }).code).toBe(
      ErrorCode.TASK_MODIFICATION_NOT_ALLOWED,
    );

    const storedTask = await prisma.task.findUniqueOrThrow({
      where: { id: created.data.id },
    });

    expect(storedTask.status).toBe(TaskStatus.TODO);
  });

  it('returns TASK_NOT_FOUND for unknown task IDs', async () => {
    const response = await request(gatewayServer)
      .get(`/api/tasks/${randomUUID()}`)
      .set('authorization', token('admin'))
      .expect(404);

    expect((response.body as { code: string }).code).toBe(
      ErrorCode.TASK_NOT_FOUND,
    );
  });
});
