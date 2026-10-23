import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { ClientModule } from '../../apps/client-service/src/client.module';
import { PrismaService } from '../../prisma/prisma.service';

type ClientResponse = {
  id: string;
  fullName: string;
  leadId: string | null;
  lead?: { id: string; customerName: string; status: string } | null;
};

describe('Client Service HTTP integration', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  const clientIds: string[] = [];
  const leadIds: string[] = [];
  const runId = randomUUID();

  async function createLead() {
    const lead = await prisma.lead.create({
      data: { customerName: `Client integration ${runId}` },
    });
    leadIds.push(lead.id);
    return lead;
  }

  async function createClient(fullName: string, leadId?: string) {
    const response = await request(server)
      .post('/clients')
      .send({ fullName, ...(leadId ? { leadId } : {}) })
      .expect(201);
    const client = response.body as ClientResponse;
    clientIds.push(client.id);
    return client;
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ClientModule],
    }).compile();

    prisma = module.get(PrismaService);
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    if (clientIds.length > 0) {
      await prisma.customer.deleteMany({ where: { id: { in: clientIds } } });
      clientIds.length = 0;
    }

    if (leadIds.length > 0) {
      await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
      leadIds.length = 0;
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('creates, lists, reads, updates and deletes a client linked to a lead', async () => {
    const lead = await createLead();
    const client = await createClient(`Client ${runId}`, lead.id);

    expect(client).toMatchObject({
      fullName: `Client ${runId}`,
      leadId: lead.id,
    });

    const saved = await prisma.customer.findUniqueOrThrow({
      where: { id: client.id },
    });
    expect(saved.fullName).toBe(`Client ${runId}`);
    expect(saved.leadId).toBe(lead.id);

    const list = await request(server).get('/clients').expect(200);
    expect(list.body as ClientResponse[]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: client.id })]),
    );

    const detail = await request(server)
      .get(`/clients/${client.id}`)
      .expect(200);
    expect(detail.body as ClientResponse).toMatchObject({
      id: client.id,
      fullName: `Client ${runId}`,
      lead: {
        id: lead.id,
        customerName: lead.customerName,
      },
    });

    await request(server)
      .patch(`/clients/${client.id}`)
      .send({ fullName: `Updated client ${runId}` })
      .expect(200);
    const updated = await prisma.customer.findUniqueOrThrow({
      where: { id: client.id },
    });
    expect(updated.fullName).toBe(`Updated client ${runId}`);

    await request(server).delete(`/clients/${client.id}`).expect(204);
    clientIds.splice(clientIds.indexOf(client.id), 1);
    await expect(
      prisma.customer.findUnique({ where: { id: client.id } }),
    ).resolves.toBeNull();
  });

  it('rejects a duplicate client link for the same lead', async () => {
    const lead = await createLead();
    await createClient(`First client ${runId}`, lead.id);

    await request(server)
      .post('/clients')
      .send({ fullName: `Second client ${runId}`, leadId: lead.id })
      .expect(409);
  });

  it('rejects invalid client bodies and UUID route parameters', async () => {
    await request(server)
      .post('/clients')
      .send({ fullName: '', leadId: 'not-a-uuid' })
      .expect(400);

    await request(server)
      .patch('/clients/00000000-0000-4000-8000-000000000001')
      .send({ fullName: '' })
      .expect(400);

    await request(server).get('/clients/not-a-uuid').expect(400);
  });

  it('returns not found for missing client read, update and delete requests', async () => {
    const missingId = randomUUID();

    await request(server).get(`/clients/${missingId}`).expect(404);
    await request(server)
      .patch(`/clients/${missingId}`)
      .send({ fullName: 'Missing client' })
      .expect(404);
    await request(server).delete(`/clients/${missingId}`).expect(404);
  });
});
