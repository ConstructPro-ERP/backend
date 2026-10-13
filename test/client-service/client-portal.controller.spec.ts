import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { ClientPortalController } from '../../apps/client-service/src/client-portal.controller';
import { ClientPortalReadService } from '../../apps/client-service/src/client-portal-read.service';

const projectId = 'b390c2c8-86f5-484f-ad9f-170bca22703d';
const actorId = 'client-user-1';

const mockPortal = {
  findProjects: jest.fn(),
  findProject: jest.fn(),
  findMilestones: jest.fn(),
  findDocuments: jest.fn(),
  findQuotations: jest.fn(),
};

describe('ClientPortalController', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClientPortalController],
      providers: [
        {
          provide: ClientPortalReadService,
          useValue: mockPortal,
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

    mockPortal.findProjects.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });

    mockPortal.findProject.mockResolvedValue({ id: projectId });
    mockPortal.findMilestones.mockResolvedValue([]);
    mockPortal.findDocuments.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });

    mockPortal.findQuotations.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists projects with pagination', async () => {
    await request(server)
      .get('/client-portal/projects?page=2&limit=5')
      .set('x-user-id', actorId)
      .expect(200);

    expect(mockPortal.findProjects).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        page: 2,
        limit: 5,
      }),
    );
  });

  it('applies default project pagination', async () => {
    await request(server)
      .get('/client-portal/projects')
      .set('x-user-id', actorId)
      .expect(200);

    expect(mockPortal.findProjects).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        page: 1,
        limit: 10,
      }),
    );
  });

  it('retrieves project details', async () => {
    await request(server)
      .get(`/client-portal/projects/${projectId}`)
      .set('x-user-id', actorId)
      .expect(200);

    expect(mockPortal.findProject).toHaveBeenCalledWith(actorId, projectId);
  });

  it('lists project milestones', async () => {
    await request(server)
      .get(`/client-portal/projects/${projectId}/milestones`)
      .set('x-user-id', actorId)
      .expect(200);

    expect(mockPortal.findMilestones).toHaveBeenCalledWith(actorId, projectId);
  });

  it('lists project documents', async () => {
    await request(server)
      .get(`/client-portal/projects/${projectId}/documents?page=2&limit=5`)
      .set('x-user-id', actorId)
      .expect(200);

    expect(mockPortal.findDocuments).toHaveBeenCalledWith(
      actorId,
      projectId,
      expect.objectContaining({
        page: 2,
        limit: 5,
      }),
    );
  });

  it('lists client quotations', async () => {
    await request(server)
      .get('/client-portal/quotations?page=2&limit=5')
      .set('x-user-id', actorId)
      .expect(200);

    expect(mockPortal.findQuotations).toHaveBeenCalledWith(
      actorId,
      expect.objectContaining({
        page: 2,
        limit: 5,
      }),
    );
  });

  it('rejects invalid project identifiers', async () => {
    await request(server)
      .get('/client-portal/projects/invalid-uuid')
      .set('x-user-id', actorId)
      .expect(400);

    expect(mockPortal.findProject).not.toHaveBeenCalled();
  });

  it('rejects invalid pagination', async () => {
    await request(server)
      .get('/client-portal/projects?page=0&limit=101')
      .set('x-user-id', actorId)
      .expect(400);

    expect(mockPortal.findProjects).not.toHaveBeenCalled();
  });

  it('rejects nonnumeric pagination', async () => {
    await request(server)
      .get('/client-portal/quotations?page=abc')
      .set('x-user-id', actorId)
      .expect(400);

    expect(mockPortal.findQuotations).not.toHaveBeenCalled();
  });
});
