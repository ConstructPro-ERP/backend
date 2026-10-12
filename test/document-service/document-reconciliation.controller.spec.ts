import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { DocumentReconciliationController } from '../../apps/document-service/src/document-reconciliation.controller';
import {
  DocumentReconciliationService,
  type DocumentReconciliationResult,
} from '../../apps/document-service/src/document-reconciliation.service';

const CRON_SECRET = 'test-document-reconciliation-secret';

const reconciliationResult: DocumentReconciliationResult = {
  checked: 2,
  activated: 1,
  failed: 0,
  cleaned: 0,
  deleted: 1,
  pending: 0,
  errors: 0,
};

const mockReconcile = jest.fn();

describe('DocumentReconciliationController', () => {
  let app: INestApplication;
  let server: Server;

  const originalCronSecret = process.env.CRON_SECRET;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DocumentReconciliationController],
      providers: [
        {
          provide: DocumentReconciliationService,
          useValue: {
            reconcile: mockReconcile,
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    server = app.getHttpServer() as Server;
  });

  beforeEach(() => {
    jest.resetAllMocks();

    process.env.CRON_SECRET = CRON_SECRET;
    mockReconcile.mockResolvedValue(reconciliationResult);
  });

  afterAll(async () => {
    await app.close();

    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it('rejects requests without authorization', async () => {
    await request(server).get('/internal/cron/documents/reconcile').expect(401);

    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('rejects requests with an invalid cron secret', async () => {
    await request(server)
      .get('/internal/cron/documents/reconcile')
      .set('authorization', 'Bearer invalid-secret')
      .expect(401);

    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('rejects requests when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;

    await request(server)
      .get('/internal/cron/documents/reconcile')
      .set('authorization', `Bearer ${CRON_SECRET}`)
      .expect(401);

    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('executes reconciliation with valid authorization', async () => {
    const response = await request(server)
      .get('/internal/cron/documents/reconcile')
      .set('authorization', `Bearer ${CRON_SECRET}`)
      .expect(200);

    expect(response.body).toEqual(reconciliationResult);
    expect(mockReconcile).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when reconciliation reports errors', async () => {
    mockReconcile.mockResolvedValueOnce({
      ...reconciliationResult,
      errors: 1,
    });

    await request(server)
      .get('/internal/cron/documents/reconcile')
      .set('authorization', `Bearer ${CRON_SECRET}`)
      .expect(503);

    expect(mockReconcile).toHaveBeenCalledTimes(1);
  });
});
