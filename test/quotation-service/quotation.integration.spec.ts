/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { QuotationModule } from '../../apps/quotation-service/src/quotation.module';
import { HttpExceptionFilter } from '../../apps/quotation-service/src/filters/http-exception.filter';
import { DocumentClient } from '../../apps/quotation-service/src/document.client';
import { ProjectClient } from '../../apps/quotation-service/src/project.client';
import { NotificationClient } from '../../apps/quotation-service/src/notification.client';

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL_TEST!,
});
const prisma = new PrismaClient({ adapter });

jest.setTimeout(30000);

const runId = Date.now().toString();

// Holds the persistent FK fixtures created by this test suite.
let realProjectId: string;
let fixtureUserId: string;
let fixtureRoleId: string;

// Mutable mock so we can set the resolved value after the DB project is created
const mockProjectClient = {
  createFromQuotation: jest.fn(),
};

describe('QuotationService — integration', () => {
  let app: INestApplication;
  let leadId = '';

  async function cleanupLead(leadIdToDelete: string) {
    if (!leadIdToDelete) {
      return;
    }

    const quotations = await prisma.quotation.findMany({
      where: {
        leadId: leadIdToDelete,
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

    await prisma.lead.deleteMany({
      where: {
        id: leadIdToDelete,
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();

    // Create a minimal Role → User → Project chain so we have a real projectId
    // for FK constraint satisfaction when the approve endpoint stores projectId.
    const role = await prisma.role.create({
      data: {
        roleName: `integration-role-${runId}`,
      },
    });

    fixtureRoleId = role.id;

    const user = await prisma.user.create({
      data: {
        fullName: 'Integration PM',
        email: `integration-pm-${runId}@test.com`,
        password: 'hashed',
        roleId: role.id,
      },
    });

    fixtureUserId = user.id;

    const project = await prisma.project.create({
      data: {
        projectName: `Integration Test Project ${runId}`,
        startDate: new Date(),
        projectManagerId: user.id,
      },
    });

    realProjectId = project.id;

    // Now wire the mock to return the real projectId
    mockProjectClient.createFromQuotation.mockResolvedValue({
      projectId: realProjectId,
      status: 'ACTIVE', // An approved quotation causes the Project to be active.
    });

    const module: TestingModule = await Test.createTestingModule({
      imports: [QuotationModule],
    })
      .overrideProvider(DocumentClient)
      .useValue({ generatePdf: jest.fn().mockResolvedValue(null) })
      .overrideProvider(ProjectClient)
      .useValue(mockProjectClient)
      .overrideProvider(NotificationClient)
      .useValue({
        notifyProjectCreated: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await cleanupLead(leadId);

    if (realProjectId) {
      await prisma.project.deleteMany({
        where: {
          id: realProjectId,
        },
      });
    }

    if (fixtureUserId) {
      await prisma.user.deleteMany({
        where: {
          id: fixtureUserId,
        },
      });
    }

    if (fixtureRoleId) {
      await prisma.role.deleteMany({
        where: {
          id: fixtureRoleId,
        },
      });
    }

    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanupLead(leadId);

    const lead = await prisma.lead.create({
      data: {
        customerName: `Integration Lead ${runId}`,
        status: 'QUALIFIED',
      },
    });

    leadId = lead.id;
  });

  describe('POST /quotations', () => {
    it('201 — creates quotation and items with server-computed total', async () => {
      const body = {
        leadId,
        items: [
          { itemName: 'Foundation', quantity: 2, unitPrice: 1500 },
          { itemName: 'Roofing', quantity: 3, unitPrice: 800 },
        ],
        notes: 'Phase 1',
      };

      const res = await request(app.getHttpServer())
        .post('/quotations')
        .send(body)
        .expect(201);

      // Server-computed: 2*1500 + 3*800 = 3000 + 2400 = 5400
      expect(Number(res.body.totalAmount)).toBe(5400);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.notes).toBe('Phase 1');

      const dbQuotation = await prisma.quotation.findUnique({
        where: { id: res.body.id },
        include: { items: true },
      });
      expect(dbQuotation).not.toBeNull();
      expect(Number(dbQuotation!.totalAmount)).toBe(5400);
      expect(dbQuotation!.items).toHaveLength(2);
    });

    it('400 VALIDATION_ERROR — empty items array is rejected', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotations')
        .send({ leadId, items: [] })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('400 VALIDATION_ERROR — missing leadId is rejected', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotations')
        .send({ items: [{ itemName: 'X', quantity: 1, unitPrice: 100 }] })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('400 VALIDATION_ERROR — negative quantity is rejected', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotations')
        .send({
          leadId,
          items: [{ itemName: 'X', quantity: -1, unitPrice: 100 }],
        })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('404 LEAD_NOT_FOUND — unknown leadId', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotations')
        .send({
          leadId: '00000000-0000-0000-0000-000000000000',
          items: [{ itemName: 'X', quantity: 1, unitPrice: 100 }],
        })
        .expect(404);

      expect(res.body.code).toBe('LEAD_NOT_FOUND');
    });
  });

  describe('GET /quotations/:id', () => {
    it('200 — returns quotation with items', async () => {
      const created = await prisma.quotation.create({
        data: {
          leadId,
          totalAmount: 500,
          items: {
            create: [
              { itemName: 'Steel', quantity: 2, unitPrice: 250, amount: 500 },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/quotations/${created.id}`)
        .expect(200);

      expect(res.body.id).toBe(created.id);
      expect(res.body.items).toHaveLength(1);
    });

    it('404 QUOTATION_NOT_FOUND — unknown id', async () => {
      const res = await request(app.getHttpServer())
        .get('/quotations/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(res.body.code).toBe('QUOTATION_NOT_FOUND');
    });
  });

  describe('PATCH /quotations/:id/approve', () => {
    it('200 — converts PENDING_APPROVAL quotation using an existing project', async () => {
      const quotation = await prisma.quotation.create({
        data: {
          leadId,
          totalAmount: 8000,
          status: 'PENDING_APPROVAL',
          items: {
            create: [
              {
                itemName: 'Bricks',
                quantity: 800,
                unitPrice: 10,
                amount: 8000,
              },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/quotations/${quotation.id}/approve`)
        .send({
          targetProjectId: realProjectId,
        })
        .expect(200);

      expect(res.body.projectId).toBe(realProjectId);
      expect(res.body.projectStatus).toBe('ACTIVE');
      expect(res.body.quotation.status).toBe('CONVERTED');

      expect(mockProjectClient.createFromQuotation).toHaveBeenLastCalledWith({
        quotationId: quotation.id,
        leadId,
        targetProjectId: realProjectId,
      });

      const db = await prisma.quotation.findUnique({
        where: { id: quotation.id },
      });

      expect(db!.projectId).toBe(realProjectId);
      expect(db!.status).toBe('CONVERTED');
    });

    it('200 — resumes conversion when an APPROVED quotation already has projectId', async () => {
      const quotation = await prisma.quotation.create({
        data: {
          leadId,
          totalAmount: 4500,
          status: 'APPROVED',
          projectId: realProjectId,
          items: {
            create: [
              {
                itemName: 'House Design',
                quantity: 1,
                unitPrice: 4500,
                amount: 4500,
              },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/quotations/${quotation.id}/approve`)
        .expect(200);

      expect(res.body.projectId).toBe(realProjectId);
      expect(res.body.projectStatus).toBe('ACTIVE');
      expect(res.body.quotation.status).toBe('CONVERTED');

      expect(mockProjectClient.createFromQuotation).toHaveBeenLastCalledWith({
        quotationId: quotation.id,
        leadId,
        targetProjectId: realProjectId,
      });

      const db = await prisma.quotation.findUnique({
        where: { id: quotation.id },
      });

      expect(db!.projectId).toBe(realProjectId);
      expect(db!.status).toBe('CONVERTED');
    });

    it('400 PROJECT_DETAILS_REQUIRED — new project details are missing', async () => {
      const quotation = await prisma.quotation.create({
        data: {
          leadId,
          totalAmount: 6000,
          status: 'PENDING_APPROVAL',
          items: {
            create: [
              {
                itemName: 'Plan Preparation',
                quantity: 1,
                unitPrice: 6000,
                amount: 6000,
              },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/quotations/${quotation.id}/approve`)
        .expect(400);

      expect(res.body.code).toBe('PROJECT_DETAILS_REQUIRED');

      const db = await prisma.quotation.findUnique({
        where: { id: quotation.id },
      });

      expect(db!.status).toBe('PENDING_APPROVAL');
      expect(db!.projectId).toBeNull();
    });

    it('409 ALREADY_CONVERTED — quotation already in CONVERTED state is rejected', async () => {
      // Use the real projectId so the FK is satisfied when seeding
      const quotation = await prisma.quotation.create({
        data: {
          leadId,
          totalAmount: 3000,
          status: 'CONVERTED',
          projectId: realProjectId,
          items: {
            create: [
              { itemName: 'Tiles', quantity: 300, unitPrice: 10, amount: 3000 },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/quotations/${quotation.id}/approve`)
        .expect(409);

      expect(res.body.code).toBe('ALREADY_CONVERTED');
    });

    it('404 QUOTATION_NOT_FOUND — unknown quotation id', async () => {
      const res = await request(app.getHttpServer())
        .patch('/quotations/00000000-0000-0000-0000-000000000000/approve')
        .expect(404);

      expect(res.body.code).toBe('QUOTATION_NOT_FOUND');
    });
  });
});
