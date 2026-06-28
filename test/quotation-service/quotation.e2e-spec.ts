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
  let leadId: string;
  let realProjectId: string;

  async function cleanQuotations() {
    await prisma.quotationItem.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.lead.deleteMany();
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
      .useValue({ notifyProjectCreated: jest.fn().mockResolvedValue(undefined) })
      .compile();

    prisma = module.get<PrismaService>(PrismaService);

    // Create Role → User → Project so realProjectId satisfies the FK on Quotation.projectId
    const suffix = Date.now();
    const role = await prisma.role.create({
      data: { roleName: `e2e-role-${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        fullName: 'E2E Project Manager',
        email: `e2e-pm-${suffix}@test.com`,
        password: 'hashed',
        roleId: role.id,
      },
    });
    const project = await prisma.project.create({
      data: {
        projectName: 'E2E Test Project',
        startDate: new Date(),
        projectManagerId: user.id,
      },
    });
    realProjectId = project.id;

    mockProjectClient.createFromQuotation.mockResolvedValue({
      projectId: realProjectId,
      status: 'PLANNING',
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
    await cleanQuotations();
    await app.close();
  });

  beforeEach(async () => {
    await cleanQuotations();
    const lead = await prisma.lead.create({
      data: { customerName: 'E2E Lead Corp', status: 'QUALIFIED' },
    });
    leadId = lead.id;
  });

  afterEach(async () => {
    await cleanQuotations();
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
            create: [{ itemName: 'Glass', quantity: 3, unitPrice: 250, amount: 750 }],
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
    it('TC-E2E-009: returns 200 and flips status to CONVERTED with a projectId', async () => {
      const quotation = await prisma.quotation.create({
        data: {
          leadId,
          totalAmount: 12000,
          status: 'PENDING_APPROVAL',
          items: {
            create: [
              { itemName: 'Foundation', quantity: 4, unitPrice: 3000, amount: 12000 },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/quotations/${quotation.id}/approve`)
        .expect(200);

      // approveAndConvert returns { quotation: Quotation, projectId: string }
      expect(res.body.quotation.status).toBe('CONVERTED');
      expect(res.body.projectId).toBeDefined();

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
              { itemName: 'Roofing', quantity: 1, unitPrice: 5000, amount: 5000 },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/quotations/${quotation.id}/approve`)
        .expect(409);

      expect(res.body.code).toBe('ALREADY_CONVERTED');
    });
  });
});
