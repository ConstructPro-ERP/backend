import {
  BadRequestException,
  INestApplication,
  Logger,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { QuotationModule } from '../../apps/quotation-service/src/quotation.module';
import { QuotationService } from '../../apps/quotation-service/src/quotation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpExceptionFilter } from '../../apps/quotation-service/src/filters/http-exception.filter';

describe('Quotation HTTP routing, validation and exception responses', () => {
  let app: INestApplication;
  let server: Server;
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    getPdf: jest.fn(),
    update: jest.fn(),
    reject: jest.fn(),
    revise: jest.fn(),
    approveAndConvert: jest.fn(),
    directApprove: jest.fn(),
    submit: jest.fn(),
  };
  const leadId = 'b947a9e3-5df4-4bcc-9d91-e71241a0a970';
  const item = { itemName: 'Concrete', quantity: 2, unitPrice: 12.5 };
  const routes = [
    {
      method: 'post',
      path: '/quotations',
      handler: 'create',
      body: { leadId, items: [item] },
      args: [{ leadId, items: [item] }],
    },
    {
      method: 'get',
      path: '/quotations/q-1',
      handler: 'findOne',
      args: ['q-1'],
    },
    {
      method: 'get',
      path: '/quotations/q-1/pdf',
      handler: 'getPdf',
      args: ['q-1'],
    },
    {
      method: 'put',
      path: '/quotations/q-1',
      handler: 'update',
      body: { notes: 'Revised', items: [item] },
      args: ['q-1', { notes: 'Revised', items: [item] }],
    },
    {
      method: 'patch',
      path: '/quotations/q-1/reject',
      handler: 'reject',
      body: { reason: 'Budget exceeded' },
      args: ['q-1', 'Budget exceeded'],
    },
    {
      method: 'patch',
      path: '/quotations/q-1/revise',
      handler: 'revise',
      args: ['q-1'],
    },
    {
      method: 'patch',
      path: '/quotations/q-1/approve',
      handler: 'approveAndConvert',
      body: { targetProjectId: leadId, directApproveOnly: true },
      args: ['q-1', { targetProjectId: leadId, directApproveOnly: true }],
    },
    {
      method: 'patch',
      path: '/quotations/q-1/direct-approve',
      handler: 'directApprove',
      args: ['q-1'],
    },
    {
      method: 'patch',
      path: '/quotations/q-1/submit',
      handler: 'submit',
      args: ['q-1'],
    },
  ] as const;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [QuotationModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(QuotationService)
      .useValue(service)
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
    server = app.getHttpServer() as Server;
  });

  beforeEach(() => {
    jest.resetAllMocks();
    for (const handler of Object.values(service))
      handler.mockResolvedValue({ id: 'q-1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(routes)(
    'forwards validated $method $path to $handler',
    async (route) => {
      const response = await request(server)
        [route.method](route.path)
        .send('body' in route ? route.body : {})
        .expect(route.method === 'post' ? 201 : 200);
      expect(response.body).toEqual({ id: 'q-1' });
      expect(service[route.handler]).toHaveBeenCalledWith(...route.args);
    },
  );

  it('applies list defaults', async () => {
    service.findAll.mockResolvedValue({ items: [], total: 0 });
    await request(server)
      .get('/quotations')
      .expect(200, { items: [], total: 0 });
    expect(service.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('transforms pagination numbers and forwards search and sorting', async () => {
    await request(server)
      .get('/quotations')
      .query({
        leadId,
        status: 'DRAFT',
        page: '2',
        limit: '5',
        search: 'Concrete',
        sortBy: 'totalAmount',
        sortOrder: 'asc',
      })
      .expect(200);
    expect(service.findAll).toHaveBeenCalledWith({
      leadId,
      status: 'DRAFT',
      page: 2,
      limit: 5,
      search: 'Concrete',
      sortBy: 'totalAmount',
      sortOrder: 'asc',
    });
  });

  it.each([
    {
      method: 'post',
      path: '/quotations',
      body: { leadId: 'invalid', items: [item] },
    },
    { method: 'post', path: '/quotations', body: { leadId, items: [] } },
    {
      method: 'post',
      path: '/quotations',
      body: { leadId, items: [{ ...item, quantity: 0 }] },
    },
    {
      method: 'post',
      path: '/quotations',
      body: { leadId, items: [{ ...item, unitPrice: -1 }] },
    },
    {
      method: 'post',
      path: '/quotations',
      body: { leadId, items: [item], status: 'CONVERTED' },
    },
    {
      method: 'post',
      path: '/quotations',
      body: { leadId, items: [item], totalAmount: 1 },
    },
    { method: 'put', path: '/quotations/q-1', body: { items: [] } },
    {
      method: 'put',
      path: '/quotations/q-1',
      body: { items: [{ ...item, quantity: 1.5 }] },
    },
    { method: 'patch', path: '/quotations/q-1/reject', body: { reason: 'no' } },
    { method: 'patch', path: '/quotations/q-1/reject', body: {} },
    {
      method: 'patch',
      path: '/quotations/q-1/approve',
      body: { targetProjectId: 'invalid' },
    },
    { method: 'patch', path: '/quotations/q-1/approve', body: { budget: -1 } },
    {
      method: 'patch',
      path: '/quotations/q-1/approve',
      body: { startDate: 'invalid' },
    },
    {
      method: 'patch',
      path: '/quotations/q-1/approve',
      body: { directApproveOnly: 'true' },
    },
  ] as const)(
    'rejects invalid $method $path payload $body before invoking service',
    async ({ method, path, body }) => {
      const response = await request(server)
        [method](path)
        .send(body)
        .expect(400);
      expect(response.body).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed.',
      });
      const details = (response.body as { details: unknown[] }).details;
      expect(details.length).toBeGreaterThan(0);
      expect(details.every((detail) => typeof detail === 'string')).toBe(true);
      for (const handler of Object.values(service))
        expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each([
    { page: '0' },
    { limit: '101' },
    { page: 'abc' },
    { status: 'INVALID' },
    { sortBy: 'invalid' },
    { sortOrder: 'invalid' },
  ])('rejects invalid list query %s', async (query) => {
    const response = await request(server)
      .get('/quotations')
      .query(query)
      .expect(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(service.findAll).not.toHaveBeenCalled();
  });

  it.each([
    {
      error: new NotFoundException({
        code: 'QUOTATION_NOT_FOUND',
        message: 'Quotation not found.',
      }),
      status: 404,
      body: { code: 'QUOTATION_NOT_FOUND', message: 'Quotation not found.' },
    },
    {
      error: new BadRequestException({
        code: 'QUOTATION_LOCKED',
        message: 'Locked.',
      }),
      status: 400,
      body: { code: 'QUOTATION_LOCKED', message: 'Locked.' },
    },
    {
      error: new Error('secret database error'),
      status: 500,
      body: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    },
  ])(
    'formats service errors as HTTP $status',
    async ({ error, status, body }) => {
      const logger = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      try {
        service.findOne.mockRejectedValue(error);
        await request(server).get('/quotations/q-1').expect(status, body);
      } finally {
        logger.mockRestore();
      }
    },
  );
});
