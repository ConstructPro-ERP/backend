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

describe('ProjectService — integration', () => {
  let app: INestApplication;
  let httpServer: Server;
  let prisma: PrismaService;

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

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ProjectModule],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);

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

  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
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
