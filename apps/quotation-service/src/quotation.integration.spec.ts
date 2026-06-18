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

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL_TEST!,
});
const prisma = new PrismaClient({ adapter });

jest.setTimeout(30000);

async function cleanup() {
  await prisma.quotationItem.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.lead.deleteMany();
}

describe('QuotationService — integration', () => {
  let app: INestApplication;
  let leadId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [QuotationModule],
    })
      .overrideProvider(DocumentClient)
      .useValue({ generatePdf: jest.fn().mockResolvedValue(null) })
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

    await prisma.$connect();
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
});
