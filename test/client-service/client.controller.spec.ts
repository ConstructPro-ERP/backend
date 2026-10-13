import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { ClientController } from '../../apps/client-service/src/client.controller';
import { ClientService } from '../../apps/client-service/src/client.service';

const customerId = 'b390c2c8-86f5-484f-ad9f-170bca22703d';
const leadId = '91f8b861-8fc8-4f1a-90e1-4c48e238ff41';
const userId = 'c45c5ef7-6b73-4d24-9da6-69c32cbd1c80';

const mockClients = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  linkPortalUser: jest.fn(),
};

describe('ClientController', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        {
          provide: ClientService,
          useValue: mockClients,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

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

  beforeEach(() => {
    jest.resetAllMocks();

    mockClients.create.mockResolvedValue({ id: customerId });
    mockClients.findAll.mockResolvedValue([{ id: customerId }]);
    mockClients.findOne.mockResolvedValue({ id: customerId });
    mockClients.update.mockResolvedValue({ id: customerId });
    mockClients.remove.mockResolvedValue(undefined);
    mockClients.linkPortalUser.mockResolvedValue({
      customerId,
      userId,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a Customer', async () => {
    await request(server)
      .post('/clients')
      .send({
        fullName: 'Test Customer',
        leadId,
      })
      .expect(201);

    expect(mockClients.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Test Customer',
        leadId,
      }),
    );
  });

  it('lists Customers', async () => {
    await request(server).get('/clients').expect(200);

    expect(mockClients.findAll).toHaveBeenCalledTimes(1);
  });

  it('retrieves a Customer', async () => {
    await request(server).get(`/clients/${customerId}`).expect(200);

    expect(mockClients.findOne).toHaveBeenCalledWith(customerId);
  });

  it('updates a Customer', async () => {
    await request(server)
      .patch(`/clients/${customerId}`)
      .send({ fullName: 'Updated Customer' })
      .expect(200);

    expect(mockClients.update).toHaveBeenCalledWith(
      customerId,
      expect.objectContaining({
        fullName: 'Updated Customer',
      }),
    );
  });

  it('links an existing Client Portal User', async () => {
    await request(server)
      .patch(`/clients/${customerId}/portal-user`)
      .send({ userId })
      .expect(200);

    expect(mockClients.linkPortalUser).toHaveBeenCalledWith(customerId, userId);
  });

  it('deletes a Customer', async () => {
    await request(server).delete(`/clients/${customerId}`).expect(204);

    expect(mockClients.remove).toHaveBeenCalledWith(customerId);
  });

  it('rejects invalid Customer identifiers', async () => {
    await request(server).get('/clients/not-a-uuid').expect(400);

    expect(mockClients.findOne).not.toHaveBeenCalled();
  });

  it('rejects invalid Customer creation data', async () => {
    await request(server)
      .post('/clients')
      .send({ fullName: '', leadId: 'invalid' })
      .expect(400);

    expect(mockClients.create).not.toHaveBeenCalled();
  });

  it('rejects invalid Customer updates', async () => {
    await request(server)
      .patch(`/clients/${customerId}`)
      .send({ fullName: '' })
      .expect(400);

    expect(mockClients.update).not.toHaveBeenCalled();
  });

  it('rejects invalid portal User identifiers', async () => {
    await request(server)
      .patch(`/clients/${customerId}/portal-user`)
      .send({ userId: 'invalid' })
      .expect(400);

    expect(mockClients.linkPortalUser).not.toHaveBeenCalled();
  });
});
