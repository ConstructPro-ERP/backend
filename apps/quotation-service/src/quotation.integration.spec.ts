/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { QuotationModule } from './quotation.module';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { DocumentClient } from './document.client';
import { ProjectClient } from './project.client';
import { NotificationClient } from './notification.client';

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL_TEST!,
});
const prisma = new PrismaClient({ adapter });

jest.setTimeout(30000);

// Holds the real projectId created in beforeAll for FK constraint satisfaction
let realProjectId: string;

// Mutable mock so we can set the resolved value after the DB project is created
const mockProjectClient = {
  createFromQuotation: jest.fn(),
};

async function cleanup() {
  await prisma.quotationItem.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.lead.deleteMany();
}

describe('QuotationService — integration', () => {
  let app: INestApplication;
  let leadId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // Create a minimal Role → User → Project chain so we have a real projectId
    // for FK constraint satisfaction when the approve endpoint stores projectId.
    const suffix = Date.now();
    const role = await prisma.role.create({
      data: { roleName: `integration-role-${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        fullName: 'Integration PM',
        email: `integration-pm-${suffix}@test.com`,
        password: 'hashed',
        roleId: role.id,
      },
    });
    const project = await prisma.project.create({
      data: {
        projectName: 'Integration Test Project',
        startDate: new Date(),
        projectManagerId: user.id,
      },
    });
    realProjectId = project.id;

    // Now wire the mock to return the real projectId
    mockProjectClient.createFromQuotation.mockResolvedValue({
      projectId: realProjectId,
      status: 'PLANNING',
    });

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
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanup();
    const lead = await prisma.lead.create({
      data: { customerName: 'Test Lead Corp', status: 'QUALIFIED' },
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
    it('200 — converts PENDING_APPROVAL quotation and stores projectId in DB', async () => {
      const quotation = await prisma.quotation.create({
        data: {
          leadId,
          totalAmount: 8000,
          status: 'PENDING_APPROVAL',
          items: {
            create: [{ itemName: 'Bricks', quantity: 800, unitPrice: 10, amount: 8000 }],
          },
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/quotations/${quotation.id}/approve`)
        .expect(200);

      expect(res.body.projectId).toBe(realProjectId);
      expect(res.body.quotation.status).toBe('CONVERTED');

      const db = await prisma.quotation.findUnique({ where: { id: quotation.id } });
      expect(db!.projectId).toBe(realProjectId);
      expect(db!.status).toBe('CONVERTED');
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
            create: [{ itemName: 'Tiles', quantity: 300, unitPrice: 10, amount: 3000 }],
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
