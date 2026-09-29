import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { ProjectModule } from '../../apps/project-service/src/project.module';
import { PrismaService } from '../../prisma/prisma.service';

jest.setTimeout(30000);

interface ProjectConversionResponseBody {
  projectId: string;
  status: string;
}

interface ProjectLifecycleErrorResponseBody {
  code: string;
  details: {
    currentStatus: ProjectStatus;
    requestedStatus: ProjectStatus;
  };
}

function parseProjectConversionResponse(
  value: unknown,
): ProjectConversionResponseBody {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('projectId' in value) ||
    typeof value.projectId !== 'string' ||
    !('status' in value) ||
    typeof value.status !== 'string'
  ) {
    throw new Error(
      'Project conversion response does not match the expected shape',
    );
  }

  return {
    projectId: value.projectId,
    status: value.status,
  };
}

function parseProjectLifecycleErrorResponse(
  value: unknown,
): ProjectLifecycleErrorResponseBody {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('code' in value) ||
    typeof value.code !== 'string' ||
    !('details' in value) ||
    typeof value.details !== 'object' ||
    value.details === null ||
    !('currentStatus' in value.details) ||
    !('requestedStatus' in value.details)
  ) {
    throw new Error(
      'Project lifecycle error response does not match the expected shape',
    );
  }

  return {
    code: value.code,
    details: {
      currentStatus: value.details.currentStatus as ProjectStatus,
      requestedStatus: value.details.requestedStatus as ProjectStatus,
    },
  };
}

describe('ProjectService — integration', () => {
  let app: INestApplication;
  let httpServer: Server;
  let prisma: PrismaService;
  let projectManagerRoleId: string;
  let adminRoleId: string;

  const runId = Date.now().toString();
  const prefix = `Project Integration ${runId}`;

  async function cleanup() {
    const leads = await prisma.lead.findMany({
      where: {
        customerName: {
          startsWith: prefix,
        },
      },
      select: {
        id: true,
      },
    });

    const leadIds = leads.map((lead) => lead.id);

    if (leadIds.length > 0) {
      await prisma.quotation.deleteMany({
        where: {
          leadId: {
            in: leadIds,
          },
        },
      });
    }

    await prisma.project.deleteMany({
      where: {
        projectName: {
          startsWith: prefix,
        },
      },
    });

    if (leadIds.length > 0) {
      await prisma.lead.deleteMany({
        where: {
          id: {
            in: leadIds,
          },
        },
      });
    }

    await prisma.user.deleteMany({
      where: {
        email: {
          startsWith: `project-integration-${runId}-`,
        },
      },
    });
  }

  async function createManager(label: string) {
    return prisma.user.create({
      data: {
        fullName: `${prefix} Manager ${label}`,
        email: `project-integration-${runId}-${label}@test.com`,
        password: 'hashed',
        roleId: projectManagerRoleId,
      },
    });
  }

  async function createAdmin(label: string) {
    return prisma.user.create({
      data: {
        fullName: `${prefix} Admin ${label}`,
        email: `project-integration-${runId}-admin-${label}@test.com`,
        password: 'hashed',
        roleId: adminRoleId,
      },
    });
  }

  async function createLead(label: string) {
    return prisma.lead.create({
      data: {
        customerName: `${prefix} Lead ${label}`,
        status: 'QUALIFIED',
      },
    });
  }

  async function createApprovedQuotationForProject(
    projectId: string,
    label: string,
  ) {
    const lead = await createLead(label);

    return prisma.quotation.create({
      data: {
        leadId: lead.id,
        projectId,
        totalAmount: 250000,
        status: 'APPROVED',
        items: {
          create: [
            {
              itemName: 'Activation Work',
              quantity: 1,
              unitPrice: 250000,
              amount: 250000,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ProjectModule],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);

    const projectManagerRole = await prisma.role.upsert({
      where: {
        roleName: 'PROJECT_MANAGER',
      },
      update: {},
      create: {
        roleName: 'PROJECT_MANAGER',
      },
    });

    const adminRole = await prisma.role.upsert({
      where: {
        roleName: 'ADMIN',
      },
      update: {},
      create: {
        roleName: 'ADMIN',
      },
    });

    projectManagerRoleId = projectManagerRole.id;
    adminRoleId = adminRole.id;

    app = module.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    httpServer = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('rejects project manager changes through the general project update endpoint', async () => {
    // Arrange
    const currentManager = await createManager('update-current');
    const newManager = await createManager('update-new');

    const project = await prisma.project.create({
      data: {
        projectName: `${prefix} Update Project`,
        location: 'Colombo',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        projectManagerId: currentManager.id,
        status: ProjectStatus.PLANNING,
      },
    });

    // Act
    await request(httpServer)
      .patch(`/projects/${project.id}`)
      .set('x-user-id', currentManager.id)
      .send({
        projectManagerId: newManager.id,
      })
      .expect(400);

    // Assert
    const updatedProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(updatedProject).not.toBeNull();
    expect(updatedProject!.projectManagerId).toBe(currentManager.id);
  });

  it('allows Admin to permanently delete an unused PLANNING Project', async () => {
    // Arrange
    const admin = await createAdmin('delete-unused');
    const manager = await createManager('delete-unused');

    const project = await prisma.project.create({
      data: {
        projectName: `${prefix} Unused Planning Project`,
        location: 'Colombo',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        projectManagerId: manager.id,
        status: ProjectStatus.PLANNING,
      },
    });

    // Act
    await request(httpServer)
      .delete(`/projects/${project.id}`)
      .set('x-user-id', admin.id)
      .expect(200);

    // Assert
    const deletedProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(deletedProject).toBeNull();
  });

  it('rejects permanent deletion when Project is not PLANNING', async () => {
    // Arrange
    const admin = await createAdmin('delete-active');
    const manager = await createManager('delete-active');

    const project = await prisma.project.create({
      data: {
        projectName: `${prefix} Active Delete Project`,
        location: 'Colombo',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        projectManagerId: manager.id,
        status: ProjectStatus.ACTIVE,
      },
    });

    // Act
    await request(httpServer)
      .delete(`/projects/${project.id}`)
      .set('x-user-id', admin.id)
      .expect(409);

    // Assert
    const existingProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(existingProject).not.toBeNull();
    expect(existingProject!.status).toBe(ProjectStatus.ACTIVE);
  });

  it('rejects permanent deletion when a PLANNING Project has related records', async () => {
    // Arrange
    const admin = await createAdmin('delete-related');
    const manager = await createManager('delete-related');
    const lead = await createLead('delete-related');

    const project = await prisma.project.create({
      data: {
        projectName: `${prefix} Related Planning Project`,
        location: 'Colombo',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        projectManagerId: manager.id,
        status: ProjectStatus.PLANNING,
      },
    });

    const quotation = await prisma.quotation.create({
      data: {
        leadId: lead.id,
        projectId: project.id,
        totalAmount: 250000,
        status: 'PENDING_APPROVAL',
        items: {
          create: [
            {
              itemName: 'Initial Design',
              quantity: 1,
              unitPrice: 250000,
              amount: 250000,
            },
          ],
        },
      },
    });

    // Act
    await request(httpServer)
      .delete(`/projects/${project.id}`)
      .set('x-user-id', admin.id)
      .expect(409);

    // Assert
    const existingProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(existingProject).not.toBeNull();

    const existingQuotation = await prisma.quotation.findUnique({
      where: {
        id: quotation.id,
      },
    });

    expect(existingQuotation).not.toBeNull();
    expect(existingQuotation!.projectId).toBe(project.id);
  });

  it('rejects permanent deletion by Project Manager', async () => {
    // Arrange
    const manager = await createManager('delete-manager');

    const project = await prisma.project.create({
      data: {
        projectName: `${prefix} Manager Delete Project`,
        location: 'Colombo',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        projectManagerId: manager.id,
        status: ProjectStatus.PLANNING,
      },
    });

    // Act
    await request(httpServer)
      .delete(`/projects/${project.id}`)
      .set('x-user-id', manager.id)
      .expect(403);

    // Assert
    const existingProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(existingProject).not.toBeNull();
  });

  it('allows ACTIVE to ON_HOLD for the assigned Project Manager', async () => {
    // Arrange
    const manager = await createManager('status-on-hold');

    const project = await prisma.project.create({
      data: {
        projectName: `${prefix} On Hold Project`,
        location: 'Colombo',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        projectManagerId: manager.id,
        status: ProjectStatus.ACTIVE,
      },
    });

    // Act
    await request(httpServer)
      .patch(`/projects/${project.id}/status`)
      .set('x-user-id', manager.id)
      .send({
        status: ProjectStatus.ON_HOLD,
      })
      .expect(200);

    // Assert
    const updatedProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(updatedProject).not.toBeNull();
    expect(updatedProject!.status).toBe(ProjectStatus.ON_HOLD);
  });

  it('rejects PLANNING to COMPLETED with a stable lifecycle error', async () => {
    // Arrange
    const manager = await createManager('status-invalid');

    const project = await prisma.project.create({
      data: {
        projectName: `${prefix} Invalid Transition Project`,
        location: 'Colombo',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        projectManagerId: manager.id,
        status: ProjectStatus.PLANNING,
      },
    });

    // Act
    const response = await request(httpServer)
      .patch(`/projects/${project.id}/status`)
      .set('x-user-id', manager.id)
      .send({
        status: ProjectStatus.COMPLETED,
      })
      .expect(400);

    const responseBody = parseProjectLifecycleErrorResponse(
      response.body as unknown,
    );

    // Assert
    expect(responseBody.code).toBe('INVALID_PROJECT_STATUS_TRANSITION');

    expect(responseBody.details).toEqual({
      currentStatus: ProjectStatus.PLANNING,
      requestedStatus: ProjectStatus.COMPLETED,
    });

    const unchangedProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(unchangedProject).not.toBeNull();
    expect(unchangedProject!.status).toBe(ProjectStatus.PLANNING);
  });

  it.each([ProjectStatus.PLANNING, ProjectStatus.ON_HOLD])(
    'activates a %s Project when activation requirements are met',
    async (initialStatus) => {
      // Arrange
      const manager = await createManager(
        `activation-${initialStatus.toLowerCase()}`,
      );

      const project = await prisma.project.create({
        data: {
          projectName: `${prefix} ${initialStatus} Activation Project`,
          location: 'Colombo',
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2027-04-30T00:00:00.000Z'),
          projectManagerId: manager.id,
          status: initialStatus,
        },
      });

      await createApprovedQuotationForProject(
        project.id,
        `activation-${initialStatus.toLowerCase()}`,
      );

      // Act
      await request(httpServer)
        .patch(`/projects/${project.id}/status`)
        .set('x-user-id', manager.id)
        .send({
          status: ProjectStatus.ACTIVE,
        })
        .expect(200);

      // Assert
      const updatedProject = await prisma.project.findUnique({
        where: {
          id: project.id,
        },
      });

      expect(updatedProject).not.toBeNull();
      expect(updatedProject!.status).toBe(ProjectStatus.ACTIVE);
    },
  );

  it('rejects activation when the assigned user is no longer a Project Manager', async () => {
    // Arrange
    const manager = await createManager('activation-role-change');

    const project = await prisma.project.create({
      data: {
        projectName: `${prefix} Manager Role Change Project`,
        location: 'Colombo',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        projectManagerId: manager.id,
        status: ProjectStatus.PLANNING,
      },
    });

    await createApprovedQuotationForProject(
      project.id,
      'activation-role-change',
    );

    const adminRole = await prisma.role.upsert({
      where: {
        roleName: 'ADMIN',
      },
      update: {},
      create: {
        roleName: 'ADMIN',
      },
    });

    await prisma.user.update({
      where: {
        id: manager.id,
      },
      data: {
        roleId: adminRole.id,
      },
    });

    // Act
    await request(httpServer)
      .patch(`/projects/${project.id}/status`)
      .set('x-user-id', manager.id)
      .send({
        status: ProjectStatus.ACTIVE,
      })
      .expect(400);

    // Assert
    const unchangedProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(unchangedProject).not.toBeNull();
    expect(unchangedProject!.status).toBe(ProjectStatus.PLANNING);
  });

  it('rejects activation when the stored Project date range is invalid', async () => {
    // Arrange
    const manager = await createManager('activation-invalid-dates');

    const project = await prisma.project.create({
      data: {
        projectName: `${prefix} Invalid Date Activation Project`,
        location: 'Colombo',
        startDate: new Date('2026-10-10T00:00:00.000Z'),
        endDate: new Date('2026-10-01T00:00:00.000Z'),
        projectManagerId: manager.id,
        status: ProjectStatus.PLANNING,
      },
    });

    await createApprovedQuotationForProject(
      project.id,
      'activation-invalid-dates',
    );

    // Act
    await request(httpServer)
      .patch(`/projects/${project.id}/status`)
      .set('x-user-id', manager.id)
      .send({
        status: ProjectStatus.ACTIVE,
      })
      .expect(400);

    // Assert
    const unchangedProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(unchangedProject).not.toBeNull();
    expect(unchangedProject!.status).toBe(ProjectStatus.PLANNING);
  });

  it('creates an ACTIVE project from an approved quotation', async () => {
    // Arrange
    const manager = await createManager('create');
    const lead = await createLead('create');

    const quotation = await prisma.quotation.create({
      data: {
        leadId: lead.id,
        totalAmount: 250000,
        status: 'APPROVED',
        items: {
          create: [
            {
              itemName: 'House Design',
              quantity: 1,
              unitPrice: 250000,
              amount: 250000,
            },
          ],
        },
      },
    });

    // Act
    const res = await request(httpServer)
      .post('/projects/from-quotation')
      .send({
        quotationId: quotation.id,
        leadId: lead.id,
        projectName: `${prefix} Create Project`,
        location: 'Colombo',
        startDate: '2026-10-01T00:00:00.000Z',
        projectManagerId: manager.id,
        budget: 10000000,
      })
      .expect(201);

    const responseBody = parseProjectConversionResponse(res.body as unknown);

    // Assert
    expect(responseBody.status).toBe(ProjectStatus.ACTIVE);

    const dbQuotation = await prisma.quotation.findUnique({
      where: {
        id: quotation.id,
      },
    });

    expect(dbQuotation).not.toBeNull();
    expect(dbQuotation!.projectId).toBe(responseBody.projectId);

    const dbProject = await prisma.project.findUnique({
      where: {
        id: responseBody.projectId,
      },
      include: {
        quotations: true,
      },
    });

    expect(dbProject).not.toBeNull();
    expect(dbProject!.status).toBe(ProjectStatus.ACTIVE);

    expect(dbProject!.budget).toBe(10000000);

    expect(dbProject!.quotations).toHaveLength(1);

    expect(dbProject!.quotations[0].id).toBe(quotation.id);
  });

  it('activates an existing PLANNING project when its first approved quotation is attached', async () => {
    // Arrange
    const manager = await createManager('attach');
    const lead = await createLead('attach');

    const project = await prisma.project.create({
      data: {
        projectName: `${prefix} Attach Project`,
        location: 'Colombo',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        projectManagerId: manager.id,
        status: ProjectStatus.PLANNING,
      },
    });

    const pendingQuotation = await prisma.quotation.create({
      data: {
        leadId: lead.id,
        totalAmount: 150000,
        status: 'PENDING_APPROVAL',
        projectId: project.id,
        items: {
          create: [
            {
              itemName: '3D Visualization',
              quantity: 1,
              unitPrice: 150000,
              amount: 150000,
            },
          ],
        },
      },
    });

    const approvedQuotation = await prisma.quotation.create({
      data: {
        leadId: lead.id,
        totalAmount: 250000,
        status: 'APPROVED',
        items: {
          create: [
            {
              itemName: 'House Design',
              quantity: 1,
              unitPrice: 250000,
              amount: 250000,
            },
          ],
        },
      },
    });

    // Act
    const res = await request(httpServer)
      .post('/projects/from-quotation')
      .send({
        quotationId: approvedQuotation.id,
        leadId: lead.id,
        targetProjectId: project.id,
      })
      .expect(201);

    const responseBody = parseProjectConversionResponse(res.body as unknown);

    // Assert
    expect(responseBody.projectId).toBe(project.id);
    expect(responseBody.status).toBe(ProjectStatus.ACTIVE);

    const dbProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
      include: {
        quotations: true,
      },
    });

    expect(dbProject!.status).toBe(ProjectStatus.ACTIVE);

    expect(dbProject!.quotations).toHaveLength(2);

    const pending = dbProject!.quotations.find(
      (quotation) => quotation.id === pendingQuotation.id,
    );

    const approved = dbProject!.quotations.find(
      (quotation) => quotation.id === approvedQuotation.id,
    );

    expect(pending!.status).toBe('PENDING_APPROVAL');

    expect(approved!.status).toBe('APPROVED');
  });

  it.each([
    ProjectStatus.ON_HOLD,
    ProjectStatus.COMPLETED,
    ProjectStatus.CANCELLED,
  ])(
    'preserves %s status when attaching an approved quotation',
    async (status) => {
      // Arrange
      const manager = await createManager(`quotation-${status.toLowerCase()}`);
      const lead = await createLead(`quotation-${status.toLowerCase()}`);

      const project = await prisma.project.create({
        data: {
          projectName: `${prefix} ${status} Project`,
          location: 'Colombo',
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          projectManagerId: manager.id,
          status,
        },
      });

      const quotation = await prisma.quotation.create({
        data: {
          leadId: lead.id,
          totalAmount: 250000,
          status: 'APPROVED',
          items: {
            create: [
              {
                itemName: 'House Design',
                quantity: 1,
                unitPrice: 250000,
                amount: 250000,
              },
            ],
          },
        },
      });

      // Act
      const response = await request(httpServer)
        .post('/projects/from-quotation')
        .send({
          quotationId: quotation.id,
          leadId: lead.id,
          targetProjectId: project.id,
        })
        .expect(201);

      const responseBody = parseProjectConversionResponse(
        response.body as unknown,
      );

      // Assert
      expect(responseBody.projectId).toBe(project.id);
      expect(responseBody.status).toBe(status);

      const updatedProject = await prisma.project.findUnique({
        where: {
          id: project.id,
        },
      });

      expect(updatedProject).not.toBeNull();
      expect(updatedProject!.status).toBe(status);

      const updatedQuotation = await prisma.quotation.findUnique({
        where: {
          id: quotation.id,
        },
      });

      expect(updatedQuotation).not.toBeNull();
      expect(updatedQuotation!.projectId).toBe(project.id);
    },
  );

  it('returns the same project for concurrent conversion requests', async () => {
    // Arrange
    const manager = await createManager('concurrent');

    const lead = await createLead('concurrent');

    const quotation = await prisma.quotation.create({
      data: {
        leadId: lead.id,
        totalAmount: 300000,
        status: 'APPROVED',
        items: {
          create: [
            {
              itemName: 'House Plan',
              quantity: 1,
              unitPrice: 300000,
              amount: 300000,
            },
          ],
        },
      },
    });

    const body = {
      quotationId: quotation.id,
      leadId: lead.id,
      projectName: `${prefix} Concurrent Project`,
      location: 'Colombo',
      startDate: '2026-10-01T00:00:00.000Z',
      projectManagerId: manager.id,
      budget: 12000000,
    };

    // Act
    const [first, second] = await Promise.all([
      request(httpServer).post('/projects/from-quotation').send(body),

      request(httpServer).post('/projects/from-quotation').send(body),
    ]);

    const firstBody = parseProjectConversionResponse(first.body as unknown);
    const secondBody = parseProjectConversionResponse(second.body as unknown);

    // Assert
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    expect(firstBody.projectId).toBe(secondBody.projectId);

    const projects = await prisma.project.findMany({
      where: {
        projectName: body.projectName,
      },
    });

    expect(projects).toHaveLength(1);

    const dbQuotation = await prisma.quotation.findUnique({
      where: {
        id: quotation.id,
      },
    });

    expect(dbQuotation).not.toBeNull();
    expect(dbQuotation!.projectId).toBe(firstBody.projectId);
  });
});
