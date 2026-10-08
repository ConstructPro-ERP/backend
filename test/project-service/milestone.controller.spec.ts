import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { MilestoneController } from '../../apps/project-service/src/milestone.controller';
import { MilestoneService } from '../../apps/project-service/src/milestone.service';

const PROJECT_ID = 'b390c2c8-86f5-484f-ad9f-170bca22703d';
const MILESTONE_ID = '91f8b861-8fc8-4f1a-90e1-4c48e238ff41';
const ACTOR_ID = 'c45c5ef7-6b73-4d24-9da6-69c32cbd1c80';

const mockService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  updateProgress: jest.fn(),
  remove: jest.fn(),
};

describe('MilestoneController', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MilestoneController],
      providers: [
        {
          provide: MilestoneService,
          useValue: mockService,
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
    jest.clearAllMocks();

    mockService.create.mockResolvedValue({ id: MILESTONE_ID });
    mockService.findAll.mockResolvedValue([{ id: MILESTONE_ID }]);
    mockService.findOne.mockResolvedValue({ id: MILESTONE_ID });
    mockService.update.mockResolvedValue({ id: MILESTONE_ID });
    mockService.updateProgress.mockResolvedValue({
      id: MILESTONE_ID,
      progressPercentage: 75,
    });
    mockService.remove.mockResolvedValue({
      message: 'Milestone deleted successfully',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a milestone with the project ID and actor', async () => {
    await request(server)
      .post(`/projects/${PROJECT_ID}/milestones`)
      .set('x-user-id', ACTOR_ID)
      .send({ milestoneName: 'Foundation', weight: 40 })
      .expect(201);

    expect(mockService.create).toHaveBeenCalledWith(
      PROJECT_ID,
      { milestoneName: 'Foundation', weight: 40 },
      ACTOR_ID,
    );
  });

  it('lists milestones belonging to a project', async () => {
    await request(server)
      .get(`/projects/${PROJECT_ID}/milestones`)
      .set('x-user-id', ACTOR_ID)
      .expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith(PROJECT_ID, ACTOR_ID);
  });

  it('retrieves a milestone by ID', async () => {
    await request(server)
      .get(`/milestones/${MILESTONE_ID}`)
      .set('x-user-id', ACTOR_ID)
      .expect(200);

    expect(mockService.findOne).toHaveBeenCalledWith(MILESTONE_ID, ACTOR_ID);
  });

  it('updates milestone metadata', async () => {
    await request(server)
      .patch(`/milestones/${MILESTONE_ID}`)
      .set('x-user-id', ACTOR_ID)
      .send({ weight: 45 })
      .expect(200);

    expect(mockService.update).toHaveBeenCalledWith(
      MILESTONE_ID,
      { weight: 45 },
      ACTOR_ID,
    );
  });

  it('updates milestone progress', async () => {
    await request(server)
      .patch(`/milestones/${MILESTONE_ID}/progress`)
      .set('x-user-id', ACTOR_ID)
      .send({ progressPercentage: 75 })
      .expect(200);

    expect(mockService.updateProgress).toHaveBeenCalledWith(
      MILESTONE_ID,
      { progressPercentage: 75 },
      ACTOR_ID,
    );
  });

  it('deletes a milestone', async () => {
    await request(server)
      .delete(`/milestones/${MILESTONE_ID}`)
      .set('x-user-id', ACTOR_ID)
      .expect(200);

    expect(mockService.remove).toHaveBeenCalledWith(MILESTONE_ID, ACTOR_ID);
  });

  it('rejects invalid milestone weights', async () => {
    await request(server)
      .post(`/projects/${PROJECT_ID}/milestones`)
      .set('x-user-id', ACTOR_ID)
      .send({ milestoneName: 'Foundation', weight: 101 })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects invalid project IDs', async () => {
    await request(server)
      .post('/projects/invalid-id/milestones')
      .set('x-user-id', ACTOR_ID)
      .send({ milestoneName: 'Foundation', weight: 40 })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects invalid milestone IDs', async () => {
    await request(server)
      .get('/milestones/invalid-id')
      .set('x-user-id', ACTOR_ID)
      .expect(400);

    expect(mockService.findOne).not.toHaveBeenCalled();
  });

  it('rejects invalid progress values', async () => {
    await request(server)
      .patch(`/milestones/${MILESTONE_ID}/progress`)
      .set('x-user-id', ACTOR_ID)
      .send({ progressPercentage: 101 })
      .expect(400);

    expect(mockService.updateProgress).not.toHaveBeenCalled();
  });

  it('rejects server-managed fields', async () => {
    await request(server)
      .post(`/projects/${PROJECT_ID}/milestones`)
      .set('x-user-id', ACTOR_ID)
      .send({
        milestoneName: 'Foundation',
        weight: 40,
        completedAt: '2026-10-08T00:00:00.000Z',
      })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('propagates service validation errors', async () => {
    mockService.create.mockRejectedValue(
      new BadRequestException({
        code: 'MILESTONE_TOTAL_WEIGHT_EXCEEDED',
        message: 'Total milestone weight cannot exceed 100.',
      }),
    );

    const response = await request(server)
      .post(`/projects/${PROJECT_ID}/milestones`)
      .set('x-user-id', ACTOR_ID)
      .send({ milestoneName: 'Foundation', weight: 40 })
      .expect(400);

    expect(response.text).toContain('MILESTONE_TOTAL_WEIGHT_EXCEEDED');
  });
});
