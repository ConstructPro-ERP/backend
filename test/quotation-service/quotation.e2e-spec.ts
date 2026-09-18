/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { QuotationModule } from '../../apps/quotation-service/src/quotation.module';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpExceptionFilter } from '../../apps/quotation-service/src/filters/http-exception.filter';
import { DocumentClient } from '../../apps/quotation-service/src/document.client';
import { ProjectClient } from '../../apps/quotation-service/src/project.client';
import { NotificationClient } from '../../apps/quotation-service/src/notification.client';

jest.setTimeout(30000);

const mockProjectClient = {
  createFromQuotation: jest.fn(),
};

describe('Quotation E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let leadId = '';
  let realProjectId: string;
  let fixtureUserId: string;
  let fixtureRoleId: string;

  const runId = Date.now().toString();

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

    prisma = module.get<PrismaService>(PrismaService);

    // Create Role → User → Project so realProjectId satisfies the FK on Quotation.projectId
    const role = await prisma.role.create({
      data: {
        roleName: `e2e-role-${runId}`,
      },
    });

    fixtureRoleId = role.id;

    const user = await prisma.user.create({
      data: {
        fullName: 'E2E Project Manager',
        email: `e2e-pm-${runId}@test.com`,
        password: 'hashed',
        roleId: role.id,
      },
    });

    fixtureUserId = user.id;

    const project = await prisma.project.create({
      data: {
        projectName: `E2E Test Project ${runId}`,
        startDate: new Date(),
        projectManagerId: user.id,
      },
    });

    realProjectId = project.id;

    mockProjectClient.createFromQuotation.mockResolvedValue({
      projectId: realProjectId,
      status: 'ACTIVE',
    });

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
  });

  beforeEach(async () => {
    await cleanupLead(leadId);

    const lead = await prisma.lead.create({
      data: {
        customerName: `E2E Lead ${runId}`,
        status: 'QUALIFIED',
      },
    });

    leadId = lead.id;
  });

  afterEach(async () => {
    await cleanupLead(leadId);
    leadId = '';
  });

  // ─── POST /quotations ──────────────────────────────────────────────────────

  describe('POST /quotations', () => {
    it('TC-E2E-001: returns 201 and persists quotation with items in DB', async () => {
      const body = {
        leadId,
        items: [
          { itemName: 'Concrete', quantity: 5, unitPrice: 200 },
          { itemName: 'Steel', quantity: 10, unitPrice: 150 },
        ],
      };

      const res = await request(app.getHttpServer())
        .post('/quotations')
        .send(body)
        .expect(201);

      // 5*200 + 10*150 = 2500
      expect(res.body.status).toBe('PENDING_APPROVAL');
      expect(Number(res.body.totalAmount)).toBe(2500);

      const dbQuotation = await prisma.quotation.findUnique({
        where: { id: res.body.id },
        include: { items: true },
      });
      expect(dbQuotation).not.toBeNull();
      expect(Number(dbQuotation!.totalAmount)).toBe(2500);
      expect(dbQuotation!.items).toHaveLength(2);
    });

    it('TC-E2E-002: returns 400 VALIDATION_ERROR when items array is empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotations')
        .send({ leadId, items: [] })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('TC-E2E-003: returns 400 when leadId is missing from request body', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotations')
        .send({ items: [{ itemName: 'Bricks', quantity: 1, unitPrice: 100 }] })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('TC-E2E-004: returns 404 when leadId does not exist in the database', async () => {
      const res = await request(app.getHttpServer())
        .post('/quotations')
        .send({
          leadId: '00000000-0000-0000-0000-000000000000',
          items: [{ itemName: 'Paint', quantity: 2, unitPrice: 50 }],
        })
        .expect(404);

      expect(res.body.code).toBe('LEAD_NOT_FOUND');
    });

    // TC-E2E-005 and TC-E2E-006 are skipped because QuotationController does not
    // yet apply JwtAuthGuard or RolesGuard. Enable once those guards are wired up.
    it.skip('TC-E2E-005: returns 403 when user has ACCOUNTANT role (RBAC guard)', async () => {
      // Generate or insert a JWT signed with role=ACCOUNTANT once guards are added.
      const accountantToken = '<ACCOUNTANT_JWT_TOKEN>';
      await request(app.getHttpServer())
        .post('/quotations')
        .set('Authorization', `Bearer ${accountantToken}`)
        .send({
          leadId,
          items: [{ itemName: 'Tiles', quantity: 1, unitPrice: 100 }],
        })
        .expect(403);
    });

    it.skip('TC-E2E-006: returns 401 when no Authorization header is provided', async () => {
      await request(app.getHttpServer())
        .post('/quotations')
        .send({
          leadId,
          items: [{ itemName: 'Tiles', quantity: 1, unitPrice: 100 }],
        })
        .expect(401);
    });
  });

  // ─── GET /quotations/:id ───────────────────────────────────────────────────

  describe('GET /quotations/:id', () => {
    it('TC-E2E-007: returns 200 with quotation data for a valid id', async () => {
      const created = await prisma.quotation.create({
        data: {
          leadId,
          totalAmount: 750,
          items: {
            create: [
              { itemName: 'Glass', quantity: 3, unitPrice: 250, amount: 750 },
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

    it('TC-E2E-008: returns 404 for a non-existent quotation id', async () => {
      const res = await request(app.getHttpServer())
        .get('/quotations/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(res.body.code).toBe('QUOTATION_NOT_FOUND');
    });
  });

  // ─── PATCH /quotations/:id/approve ────────────────────────────────────────

  describe('PATCH /quotations/:id/approve', () => {
    it('TC-E2E-009: returns 200 and converts quotation using an existing project', async () => {
      const quotation = await prisma.quotation.create({
        data: {
          leadId,
          totalAmount: 12000,
          status: 'PENDING_APPROVAL',
          items: {
            create: [
              {
                itemName: 'Foundation',
                quantity: 4,
                unitPrice: 3000,
                amount: 12000,
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

      expect(res.body.quotation.status).toBe('CONVERTED');
      expect(res.body.projectId).toBe(realProjectId);
      expect(res.body.projectStatus).toBe('ACTIVE');

      expect(mockProjectClient.createFromQuotation).toHaveBeenLastCalledWith({
        quotationId: quotation.id,
        leadId,
        targetProjectId: realProjectId,
      });

      const db = await prisma.quotation.findUnique({
        where: { id: quotation.id },
      });

      expect(db!.status).toBe('CONVERTED');
      expect(db!.projectId).toBe(realProjectId);
    });

    it('TC-E2E-010: returns 409 when quotation is already CONVERTED (BR-10.2)', async () => {
      const quotation = await prisma.quotation.create({
        data: {
          leadId,
          totalAmount: 5000,
          status: 'CONVERTED',
          projectId: realProjectId,
          items: {
            create: [
              {
                itemName: 'Roofing',
                quantity: 1,
                unitPrice: 5000,
                amount: 5000,
              },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/quotations/${quotation.id}/approve`)
        .expect(409);

      expect(res.body.code).toBe('ALREADY_CONVERTED');
    });

    it('TC-E2E-011: resumes an APPROVED quotation already linked to a project', async () => {
      const quotation = await prisma.quotation.create({
        data: {
          leadId,
          totalAmount: 7000,
          status: 'APPROVED',
          projectId: realProjectId,
          items: {
            create: [
              {
                itemName: 'House Design',
                quantity: 1,
                unitPrice: 7000,
                amount: 7000,
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

      const db = await prisma.quotation.findUnique({
        where: { id: quotation.id },
      });

      expect(db!.projectId).toBe(realProjectId);
      expect(db!.status).toBe('CONVERTED');
    });

    it('TC-E2E-012: returns 400 when no existing project or new project details are provided', async () => {
      const quotation = await prisma.quotation.create({
        data: {
          leadId,
          totalAmount: 9500,
          status: 'PENDING_APPROVAL',
          items: {
            create: [
              {
                itemName: '3D Visualization',
                quantity: 1,
                unitPrice: 9500,
                amount: 9500,
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
  });
});
