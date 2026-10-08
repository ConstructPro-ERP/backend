import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { ProjectModule } from '../../apps/project-service/src/project.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../shared/error-codes';

jest.setTimeout(30000);

describe('Milestone Service — database integration', () => {
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

  it('persists milestone CRUD operations and recalculates weighted progress', async () => {
    const project = await createProject();

    const firstResponse = await request(server)
      .post(`/projects/${project.id}/milestones`)
      .set('x-user-id', managerId)
      .send({
        milestoneName: 'Foundation',
        description: 'Original foundation work',
        dueDate: '2020-01-01T00:00:00.000Z',
        weight: 2,
        progressPercentage: 100,
      })
      .expect(201);

    const first = firstResponse.body as {
      id: string;
      status: string;
      progressPercentage: number;
      isDelayed: boolean;
    };

    expect(first.status).toBe('COMPLETED');
    expect(first.progressPercentage).toBe(100);
    expect(first.isDelayed).toBe(false);

    const secondResponse = await request(server)
      .post(`/projects/${project.id}/milestones`)
      .set('x-user-id', managerId)
      .send({
        milestoneName: 'Structure',
        weight: 8,
        progressPercentage: 50,
      })
      .expect(201);

    const second = secondResponse.body as { id: string };

    // (2 * 100 + 8 * 50) / 10 = 60
    let savedProject = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });

    expect(savedProject.progressPercentage).toBeCloseTo(60, 8);

    const listResponse = await request(server)
      .get(`/projects/${project.id}/milestones`)
      .set('x-user-id', managerId)
      .expect(200);

    const milestones = listResponse.body as Array<{ id: string }>;

    expect(milestones.map((item) => item.id)).toEqual([first.id, second.id]);

    const detailResponse = await request(server)
      .get(`/milestones/${first.id}`)
      .set('x-user-id', managerId)
      .expect(200);

    expect(detailResponse.body).toMatchObject({
      id: first.id,
      milestoneName: 'Foundation',
      status: 'COMPLETED',
      progressPercentage: 100,
      isDelayed: false,
    });

    await request(server)
      .patch(`/milestones/${first.id}`)
      .set('x-user-id', managerId)
      .send({
        milestoneName: 'Updated Foundation',
        description: null,
        dueDate: null,
        weight: 8,
      })
      .expect(200);

    const updated = await prisma.milestone.findUniqueOrThrow({
      where: { id: first.id },
    });

    expect(updated.milestoneName).toBe('Updated Foundation');
    expect(updated.description).toBeNull();
    expect(updated.dueDate).toBeNull();
    expect(updated.weight).toBe(8);
    expect(updated.progressPercentage).toBe(100);

    // (8 * 100 + 8 * 50) / 16 = 75
    savedProject = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });

    expect(savedProject.progressPercentage).toBeCloseTo(75, 8);
  });

  it('maintains milestone status and completion timestamps correctly', async () => {
    const project = await createProject();

    const createdResponse = await request(server)
      .post(`/projects/${project.id}/milestones`)
      .set('x-user-id', managerId)
      .send({
        milestoneName: 'Electrical Work',
        weight: 5,
      })
      .expect(201);

    const milestone = createdResponse.body as { id: string };

    let saved = await prisma.milestone.findUniqueOrThrow({
      where: { id: milestone.id },
    });

    expect(saved.progressPercentage).toBe(0);
    expect(saved.status).toBe('PENDING');
    expect(saved.completedAt).toBeNull();

    await request(server)
      .patch(`/milestones/${milestone.id}/progress`)
      .set('x-user-id', managerId)
      .send({ progressPercentage: 45 })
      .expect(200);

    saved = await prisma.milestone.findUniqueOrThrow({
      where: { id: milestone.id },
    });

    expect(saved.progressPercentage).toBe(45);
    expect(saved.status).toBe('IN_PROGRESS');
    expect(saved.completedAt).toBeNull();

    await request(server)
      .patch(`/milestones/${milestone.id}/progress`)
      .set('x-user-id', managerId)
      .send({ progressPercentage: 100 })
      .expect(200);

    saved = await prisma.milestone.findUniqueOrThrow({
      where: { id: milestone.id },
    });

    expect(saved.progressPercentage).toBe(100);
    expect(saved.status).toBe('COMPLETED');
    expect(saved.completedAt).not.toBeNull();

    const originalCompletedAt = saved.completedAt;

    await request(server)
      .patch(`/milestones/${milestone.id}/progress`)
      .set('x-user-id', managerId)
      .send({ progressPercentage: 100 })
      .expect(200);

    saved = await prisma.milestone.findUniqueOrThrow({
      where: { id: milestone.id },
    });

    expect(saved.completedAt).toEqual(originalCompletedAt);

    await request(server)
      .patch(`/milestones/${milestone.id}/progress`)
      .set('x-user-id', managerId)
      .send({ progressPercentage: 0 })
      .expect(200);

    saved = await prisma.milestone.findUniqueOrThrow({
      where: { id: milestone.id },
    });

    expect(saved.progressPercentage).toBe(0);
    expect(saved.status).toBe('PENDING');
    expect(saved.completedAt).toBeNull();

    const updatedProject = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });

    expect(updatedProject.progressPercentage).toBe(0);
  });

  it('rejects inconsistent progress without changing stored records', async () => {
    const project = await createProject();

    const createdResponse = await request(server)
      .post(`/projects/${project.id}/milestones`)
      .set('x-user-id', managerId)
      .send({
        milestoneName: 'Roof Construction',
        weight: 5,
        progressPercentage: 25,
      })
      .expect(201);

    const milestone = createdResponse.body as { id: string };

    const response = await request(server)
      .patch(`/milestones/${milestone.id}/progress`)
      .set('x-user-id', managerId)
      .send({
        progressPercentage: 100,
        status: 'IN_PROGRESS',
      })
      .expect(400);

    expect((response.body as { code: string }).code).toBe(
      ErrorCode.MILESTONE_INVALID_STATUS_PROGRESS,
    );

    const saved = await prisma.milestone.findUniqueOrThrow({
      where: { id: milestone.id },
    });

    const savedProject = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });

    expect(saved.progressPercentage).toBe(25);
    expect(saved.status).toBe('IN_PROGRESS');
    expect(savedProject.progressPercentage).toBe(25);

    await request(server)
      .post(`/projects/${project.id}/milestones`)
      .set('x-user-id', managerId)
      .send({
        milestoneName: 'Invalid Milestone',
        weight: 2,
        progressPercentage: 50,
        status: 'PENDING',
      })
      .expect(400);

    const count = await prisma.milestone.count({
      where: { projectId: project.id },
    });

    expect(count).toBe(1);
  });

  it.each([ProjectStatus.COMPLETED, ProjectStatus.CANCELLED])(
    'rejects milestone modifications for %s projects',
    async (status) => {
      const project = await createProject();

      await prisma.project.update({
        where: { id: project.id },
        data: { status },
      });

      const milestone = await prisma.milestone.create({
        data: {
          projectId: project.id,
          milestoneName: 'Existing Work',
          weight: 5,
        },
      });

      // Create each request only when it is executed.
      const operations = [
        () =>
          request(server)
            .post(`/projects/${project.id}/milestones`)
            .set('x-user-id', managerId)
            .send({
              milestoneName: 'New Work',
              weight: 5,
            }),

        () =>
          request(server)
            .patch(`/milestones/${milestone.id}`)
            .set('x-user-id', managerId)
            .send({ weight: 7 }),

        () =>
          request(server)
            .patch(`/milestones/${milestone.id}/progress`)
            .set('x-user-id', managerId)
            .send({ progressPercentage: 50 }),

        () =>
          request(server)
            .delete(`/milestones/${milestone.id}`)
            .set('x-user-id', managerId),
      ];

      for (const operation of operations) {
        const response = await operation().expect(409);

        expect((response.body as { code: string }).code).toBe(
          ErrorCode.MILESTONE_MODIFICATION_NOT_ALLOWED,
        );
      }

      // Confirm that no milestone modification was persisted.
      const savedMilestone = await prisma.milestone.findUniqueOrThrow({
        where: { id: milestone.id },
      });

      expect(savedMilestone.milestoneName).toBe('Existing Work');
      expect(savedMilestone.weight).toBe(5);
      expect(savedMilestone.progressPercentage).toBe(0);
      expect(savedMilestone.status).toBe('PENDING');

      expect(
        await prisma.milestone.count({
          where: { projectId: project.id },
        }),
      ).toBe(1);

      const savedProject = await prisma.project.findUniqueOrThrow({
        where: { id: project.id },
      });

      expect(savedProject.status).toBe(status);
      expect(savedProject.progressPercentage).toBe(0);
    },
  );

  it('enforces manager, accountant, admin and inactive-user permissions', async () => {
    const project = await createProject();
    const temporaryUserIds: string[] = [];

    async function createActor(
      roleName: 'ADMIN' | 'ACCOUNTANT' | 'PROJECT_MANAGER',
      label: string,
      inactive = false,
    ): Promise<string> {
      const role = await prisma.role.upsert({
        where: { roleName },
        update: {},
        create: { roleName },
      });

      const user = await prisma.user.create({
        data: {
          fullName: `Milestone Permission ${label}`,
          email: `milestone-permission-${Date.now()}-${label}@test.com`,
          password: 'hashed',
          roleId: role.id,
          status: inactive ? 'INACTIVE' : 'ACTIVE',
        },
      });

      temporaryUserIds.push(user.id);
      return user.id;
    }

    try {
      const otherManagerId = await createActor(
        'PROJECT_MANAGER',
        'other-manager',
      );

      const accountantId = await createActor('ACCOUNTANT', 'accountant');

      const adminId = await createActor('ADMIN', 'admin');

      const inactiveManagerId = await createActor(
        'PROJECT_MANAGER',
        'inactive-manager',
        true,
      );

      const createdResponse = await request(server)
        .post(`/projects/${project.id}/milestones`)
        .set('x-user-id', managerId)
        .send({
          milestoneName: 'Foundation',
          weight: 5,
        })
        .expect(201);

      const milestone = createdResponse.body as { id: string };

      await request(server)
        .get(`/milestones/${milestone.id}`)
        .set('x-user-id', otherManagerId)
        .expect(403);

      await request(server)
        .patch(`/milestones/${milestone.id}`)
        .set('x-user-id', otherManagerId)
        .send({ weight: 7 })
        .expect(403);

      await request(server)
        .get(`/milestones/${milestone.id}`)
        .set('x-user-id', accountantId)
        .expect(200);

      await request(server)
        .patch(`/milestones/${milestone.id}`)
        .set('x-user-id', accountantId)
        .send({ weight: 7 })
        .expect(403);

      await request(server).get(`/milestones/${milestone.id}`).expect(401);

      await request(server)
        .get(`/milestones/${milestone.id}`)
        .set('x-user-id', inactiveManagerId)
        .expect(403);

      await request(server)
        .patch(`/milestones/${milestone.id}`)
        .set('x-user-id', adminId)
        .send({ milestoneName: 'Admin Updated' })
        .expect(200);

      const saved = await prisma.milestone.findUniqueOrThrow({
        where: { id: milestone.id },
      });

      expect(saved.milestoneName).toBe('Admin Updated');
      expect(saved.weight).toBe(5);
    } finally {
      await prisma.user.deleteMany({
        where: {
          id: { in: temporaryUserIds },
        },
      });
    }
  });

  it('preserves weighted progress consistency during concurrent updates', async () => {
    const project = await createProject();

    const createdResponse = await request(server)
      .post(`/projects/${project.id}/milestones`)
      .set('x-user-id', managerId)
      .send({
        milestoneName: 'Concurrent Work',
        weight: 6,
        progressPercentage: 25,
      })
      .expect(201);

    const milestone = createdResponse.body as { id: string };

    const responses = await Promise.all([
      request(server)
        .patch(`/milestones/${milestone.id}/progress`)
        .set('x-user-id', managerId)
        .send({ progressPercentage: 100 }),

      request(server)
        .patch(`/milestones/${milestone.id}/progress`)
        .set('x-user-id', managerId)
        .send({ progressPercentage: 35 }),
    ]);

    for (const response of responses) {
      expect([200, 409]).toContain(response.status);
    }

    expect(responses.some((response) => response.status === 200)).toBe(true);

    const savedMilestone = await prisma.milestone.findUniqueOrThrow({
      where: { id: milestone.id },
    });

    const savedProject = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
    });

    expect(savedProject.progressPercentage).toBeCloseTo(
      savedMilestone.progressPercentage,
      8,
    );

    expect(savedMilestone.status).toBe(
      savedMilestone.progressPercentage === 100 ? 'COMPLETED' : 'IN_PROGRESS',
    );

    expect(savedMilestone.completedAt === null).toBe(
      savedMilestone.progressPercentage !== 100,
    );
  });
});
