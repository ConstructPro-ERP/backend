import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ProjectStatus, QuotationStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { ProjectModule } from '../../apps/project-service/src/project.module';
import { DocumentClient } from '../../apps/quotation-service/src/document.client';
import { HttpExceptionFilter } from '../../apps/quotation-service/src/filters/http-exception.filter';
import { NotificationClient } from '../../apps/quotation-service/src/notification.client';
import { QuotationModule } from '../../apps/quotation-service/src/quotation.module';
import { PrismaService } from '../../prisma/prisma.service';

jest.setTimeout(45000);

interface QuotationConversionResponseBody {
  projectId: string;
  projectStatus: string;
  quotation: {
    id: string;
    status: string;
    projectId: string | null;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseConversionResponse(
  value: unknown,
): QuotationConversionResponseBody {
  if (
    !isRecord(value) ||
    typeof value.projectId !== 'string' ||
    typeof value.projectStatus !== 'string' ||
    !isRecord(value.quotation) ||
    typeof value.quotation.id !== 'string' ||
    typeof value.quotation.status !== 'string'
  ) {
    throw new Error('Quotation conversion response has an invalid shape');
  }

  const quotationProjectId = value.quotation.projectId;

  if (quotationProjectId !== null && typeof quotationProjectId !== 'string') {
    throw new Error(
      'Quotation conversion response contains an invalid projectId',
    );
  }

  return {
    projectId: value.projectId,
    projectStatus: value.projectStatus,
    quotation: {
      id: value.quotation.id,
      status: value.quotation.status,
      projectId: quotationProjectId,
    },
  };
}

describe('Quotation → Project cross-service integration', () => {
  let projectApp: INestApplication;
  let quotationApp: INestApplication;
  let quotationServer: Server;
  let prisma: PrismaService;
  let projectManagerRoleId: string;

  const originalProjectServiceUrl = process.env.PROJECT_SERVICE_URL;

  const runId = `${Date.now()}-${process.pid}`;
  const prefix = `Quotation Project Integration ${runId}`;

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
      const quotations = await prisma.quotation.findMany({
        where: {
          leadId: {
            in: leadIds,
          },
        },
        select: {
          id: true,
        },
      });

      const quotationIds = quotations.map((quotation) => quotation.id);

      if (quotationIds.length > 0) {
        await prisma.quotationItem.deleteMany({
          where: {
            quotationId: {
              in: quotationIds,
            },
          },
        });

        await prisma.quotation.deleteMany({
          where: {
            id: {
              in: quotationIds,
            },
          },
        });
      }
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
          startsWith: `quotation-project-${runId}-`,
        },
      },
    });
  }

  async function createManager(label: string) {
    return prisma.user.create({
      data: {
        fullName: `${prefix} Manager ${label}`,
        email: `quotation-project-${runId}-${label}@test.com`,
        password: 'hashed',
        roleId: projectManagerRoleId,
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
    /*
     * Start the real Project Service first.
     * Port 0 asks the operating system for an available test port.
     */
    const projectModule: TestingModule = await Test.createTestingModule({
      imports: [ProjectModule],
    }).compile();

    prisma = projectModule.get<PrismaService>(PrismaService);

    const role = await prisma.role.findUniqueOrThrow({
      where: { roleName: 'PROJECT_MANAGER' },
    });

    projectManagerRoleId = role.id;

    projectApp = projectModule.createNestApplication();

    projectApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await projectApp.listen(0, '127.0.0.1');

    const projectServer = projectApp.getHttpServer() as Server;
    const address = projectServer.address();

    if (!address || typeof address === 'string') {
      throw new Error('Could not determine Project Service test port');
    }

    const projectAddress = address;

    /*
     * ProjectClient reads PROJECT_SERVICE_URL when its provider is created.
     * Set the real URL before compiling QuotationModule.
     */
    process.env.PROJECT_SERVICE_URL = `http://127.0.0.1:${projectAddress.port}`;

    const quotationModule: TestingModule = await Test.createTestingModule({
      imports: [QuotationModule],
    })
      .overrideProvider(DocumentClient)
      .useValue({
        generatePdf: jest.fn().mockResolvedValue(null),
      })
      .overrideProvider(NotificationClient)
      .useValue({
        notifyProjectCreated: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    /*
     * Intentionally DO NOT override ProjectClient here.
     * This suite must use the real ProjectClient.
     */

    quotationApp = quotationModule.createNestApplication();

    quotationApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    quotationApp.useGlobalFilters(new HttpExceptionFilter());

    await quotationApp.init();

    quotationServer = quotationApp.getHttpServer() as Server;

    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();

    await quotationApp.close();
    await projectApp.close();

    if (originalProjectServiceUrl === undefined) {
      delete process.env.PROJECT_SERVICE_URL;
    } else {
      process.env.PROJECT_SERVICE_URL = originalProjectServiceUrl;
    }
  });

  it('converts a quotation through the real Project Service', async () => {
    // Arrange
    const manager = await createManager('create');
    const lead = await createLead('create');

    const quotation = await prisma.quotation.create({
      data: {
        leadId: lead.id,
        totalAmount: 250000,
        status: QuotationStatus.PENDING_APPROVAL,
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

    const projectName = `${prefix} Created Project`;

    // Act
    const response = await request(quotationServer)
      .patch(`/quotations/${quotation.id}/approve`)
      .send({
        projectName,
        location: 'Colombo',
        startDate: '2026-10-01T00:00:00.000Z',
        projectManagerId: manager.id,
        budget: 10000000,
      });

    if (response.status !== 200) {
      throw new Error(
        `Expected HTTP 200, received ${response.status}: ` +
          JSON.stringify(response.body),
      );
    }

    const body = parseConversionResponse(response.body as unknown);

    // Assert HTTP response
    expect(body.projectStatus).toBe(ProjectStatus.ACTIVE);
    expect(body.quotation.id).toBe(quotation.id);
    expect(body.quotation.status).toBe(QuotationStatus.CONVERTED);
    expect(body.quotation.projectId).toBe(body.projectId);

    // Assert Quotation Service persisted final conversion state
    const dbQuotation = await prisma.quotation.findUnique({
      where: {
        id: quotation.id,
      },
    });

    expect(dbQuotation).not.toBeNull();
    expect(dbQuotation!.status).toBe(QuotationStatus.CONVERTED);
    expect(dbQuotation!.projectId).toBe(body.projectId);

    // Assert Project Service really created the Project
    const dbProject = await prisma.project.findUnique({
      where: {
        id: body.projectId,
      },
    });

    expect(dbProject).not.toBeNull();
    expect(dbProject!.projectName).toBe(projectName);
    expect(dbProject!.status).toBe(ProjectStatus.ACTIVE);
    expect(dbProject!.projectManagerId).toBe(manager.id);
    expect(dbProject!.budget).toBe(10000000);

    // Assert idempotency boundary did not create duplicate Projects
    const projectCount = await prisma.project.count({
      where: {
        projectName,
      },
    });

    expect(projectCount).toBe(1);
  });

  it('recovers an APPROVED quotation already linked to an existing project', async () => {
    // Arrange
    const manager = await createManager('recovery');
    const lead = await createLead('recovery');

    const project = await prisma.project.create({
      data: {
        projectName: `${prefix} Recovery Project`,
        location: 'Kandy',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        projectManagerId: manager.id,
        status: ProjectStatus.PLANNING,
      },
    });

    const quotation = await prisma.quotation.create({
      data: {
        leadId: lead.id,
        totalAmount: 180000,
        status: QuotationStatus.APPROVED,
        projectId: project.id,
        items: {
          create: [
            {
              itemName: 'Planning Scope',
              quantity: 1,
              unitPrice: 180000,
              amount: 180000,
            },
          ],
        },
      },
    });

    // Act
    const response = await request(quotationServer)
      .patch(`/quotations/${quotation.id}/approve`)
      .send({})
      .expect(200);

    const body = parseConversionResponse(response.body as unknown);

    // Assert
    expect(body.projectId).toBe(project.id);
    expect(body.projectStatus).toBe(ProjectStatus.ACTIVE);
    expect(body.quotation.status).toBe(QuotationStatus.CONVERTED);
    expect(body.quotation.projectId).toBe(project.id);

    const dbQuotation = await prisma.quotation.findUnique({
      where: {
        id: quotation.id,
      },
    });

    expect(dbQuotation).not.toBeNull();
    expect(dbQuotation!.status).toBe(QuotationStatus.CONVERTED);
    expect(dbQuotation!.projectId).toBe(project.id);

    const dbProject = await prisma.project.findUnique({
      where: {
        id: project.id,
      },
    });

    expect(dbProject).not.toBeNull();
    expect(dbProject!.status).toBe(ProjectStatus.ACTIVE);

    const projectCount = await prisma.project.count({
      where: {
        projectName: project.projectName,
      },
    });

    expect(projectCount).toBe(1);
  });
  it('covers the HTTP lifecycle, revision, PDF failure, locks, and duplicate conversion', async () => {
    const lead = await createLead('workflow');
    const manager = await createManager('workflow');
    const created = await request(quotationServer)
      .post('/quotations')
      .send({
        leadId: lead.id,
        status: 'DRAFT',
        items: [{ itemName: 'Concrete', quantity: 3, unitPrice: 33.33 }],
      })
      .expect(201);
    const body = created.body as { id: string; totalAmount: string | number };
    expect(Number(body.totalAmount)).toBe(99.99);
    const url = `/quotations/${body.id}`;
    const listStarted = performance.now();
    await request(quotationServer)
      .get('/quotations')
      .query({ leadId: lead.id, limit: 1 })
      .expect(200);
    const listMs = performance.now() - listStarted;
    const detailStarted = performance.now();
    await request(quotationServer).get(url).expect(200);
    const detailMs = performance.now() - detailStarted;
    await request(quotationServer)
      .patch(`${url}/approve`)
      .send({ targetProjectId: manager.id })
      .expect(400);
    await request(quotationServer)
      .put(url)
      .send({
        notes: 'Workflow test',
        items: [{ itemName: 'Steel', quantity: 2, unitPrice: 10.05 }],
      })
      .expect(200);
    await request(quotationServer).patch(`${url}/submit`).send({}).expect(200);
    await request(quotationServer)
      .patch(`${url}/reject`)
      .send({ reason: 'Revise scope' })
      .expect(200);
    await request(quotationServer).patch(`${url}/revise`).send({}).expect(200);
    await request(quotationServer).patch(`${url}/submit`).send({}).expect(200);
    await request(quotationServer)
      .patch(`${url}/direct-approve`)
      .send({})
      .expect(200);
    await request(quotationServer).get(`${url}/pdf`).expect(502);
    const conversionStarted = performance.now();
    const converted = await request(quotationServer)
      .patch(`${url}/approve`)
      .send({
        projectName: `${prefix} Workflow Project`,
        startDate: '2026-10-01T00:00:00.000Z',
        projectManagerId: manager.id,
      })
      .expect(200);
    console.log('Quotation test-environment timings (single sample, ms)', {
      list: Math.round(listMs),
      detail: Math.round(detailMs),
      conversion: Math.round(performance.now() - conversionStarted),
    });
    const conversion = parseConversionResponse(converted.body as unknown);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: conversion.projectId },
    });
    expect(project.budget).toBe(20.1);
    await request(quotationServer)
      .put(url)
      .send({ notes: 'Forbidden' })
      .expect(400);
    await request(quotationServer).patch(`${url}/approve`).send({}).expect(409);
  });

  it('creates only one project for simultaneous conversion requests', async () => {
    const lead = await createLead('concurrent');
    const manager = await createManager('concurrent');
    const quotation = await prisma.quotation.create({
      data: {
        leadId: lead.id,
        status: 'APPROVED',
        totalAmount: 100,
      },
    });
    const projectName = `${prefix} Concurrent Project`;
    const payload = {
      projectName,
      startDate: '2026-10-01T00:00:00.000Z',
      projectManagerId: manager.id,
    };
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(quotationServer)
          .patch(`/quotations/${quotation.id}/approve`)
          .send(payload),
      ),
    );
    expect(responses.some((response) => response.status === 200)).toBe(true);
    responses.forEach((response) =>
      expect([200, 409]).toContain(response.status),
    );
    const projects = await prisma.project.findMany({ where: { projectName } });
    expect(projects).toHaveLength(1);
    const persisted = await prisma.quotation.findUniqueOrThrow({
      where: { id: quotation.id },
    });
    expect(persisted.status).toBe('CONVERTED');
    expect(persisted.projectId).toBe(projects[0].id);
  });

  it('keeps approval retryable and creates no project after invalid manager failure', async () => {
    const lead = await createLead('failure');
    const quotation = await prisma.quotation.create({
      data: { leadId: lead.id, status: 'APPROVED', totalAmount: 100 },
    });
    const projectName = `${prefix} Failed Project`;
    const response = await request(quotationServer)
      .patch(`/quotations/${quotation.id}/approve`)
      .send({
        projectName,
        startDate: '2026-10-01T00:00:00.000Z',
        projectManagerId: '550e8400-e29b-41d4-a716-446655440000',
      });
    expect([400, 404]).toContain(response.status);
    const persisted = await prisma.quotation.findUniqueOrThrow({
      where: { id: quotation.id },
    });
    expect(persisted.status).toBe('APPROVED');
    expect(persisted.projectId).toBeNull();
    expect(await prisma.project.count({ where: { projectName } })).toBe(0);
  });
});
