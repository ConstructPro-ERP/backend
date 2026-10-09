import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { TaskController } from '../../apps/task-service/src/task.controller';
import { TaskService } from '../../apps/task-service/src/task.service';

const PROJECT_ID = 'b390c2c8-86f5-484f-ad9f-170bca22703d';
const TASK_ID = '91f8b861-8fc8-4f1a-90e1-4c48e238ff41';
const ACTOR_ID = 'c45c5ef7-6b73-4d24-9da6-69c32cbd1c80';
const ASSIGNEE_ID = 'f5ff5c48-922c-4f43-b49b-9330f422d041';

const mockService = {
  getHealth: jest.fn(),
  create: jest.fn(),
  findAll: jest.fn(),
  findByProject: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  assign: jest.fn(),
  remove: jest.fn(),
};

describe('TaskController', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TaskController],
      providers: [
        {
          provide: TaskService,
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

    mockService.getHealth.mockReturnValue({
      service: 'task-service',
      status: 'ok',
    });

    mockService.create.mockResolvedValue({ id: TASK_ID });
    mockService.findAll.mockResolvedValue({
      data: [{ id: TASK_ID }],
      meta: {
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      },
    });

    mockService.findByProject.mockResolvedValue({
      data: [{ id: TASK_ID }],
      meta: {
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      },
    });

    mockService.findOne.mockResolvedValue({ id: TASK_ID });
    mockService.update.mockResolvedValue({ id: TASK_ID });
    mockService.updateStatus.mockResolvedValue({
      id: TASK_ID,
      status: 'IN_PROGRESS',
    });
    mockService.assign.mockResolvedValue({
      id: TASK_ID,
      assignedToId: ASSIGNEE_ID,
    });
    mockService.remove.mockResolvedValue({
      message: 'Task deleted successfully',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns task service health', async () => {
    await request(server).get('/tasks/health').expect(200);

    expect(mockService.getHealth).toHaveBeenCalledTimes(1);
    expect(mockService.findOne).not.toHaveBeenCalled();
  });

  it('creates a task and forwards the actor ID', async () => {
    const dto = {
      projectId: PROJECT_ID,
      taskName: 'Prepare materials',
    };

    await request(server)
      .post('/tasks')
      .set('x-user-id', ACTOR_ID)
      .send(dto)
      .expect(201);

    expect(mockService.create).toHaveBeenCalledWith(dto, ACTOR_ID);
  });

  it('forwards task list filters and transformed pagination', async () => {
    await request(server)
      .get('/tasks')
      .set('x-user-id', ACTOR_ID)
      .query({
        projectId: PROJECT_ID,
        status: 'BLOCKED',
        page: '2',
        limit: '5',
        sortBy: 'dueDate',
        sortOrder: 'asc',
      })
      .expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        status: 'BLOCKED',
        page: 2,
        limit: 5,
        sortBy: 'dueDate',
        sortOrder: 'asc',
      }),
      ACTOR_ID,
    );
  });

  it('lists tasks belonging to a project', async () => {
    await request(server)
      .get(`/projects/${PROJECT_ID}/tasks`)
      .set('x-user-id', ACTOR_ID)
      .query({ status: 'TODO' })
      .expect(200);

    expect(mockService.findByProject).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({ status: 'TODO' }),
      ACTOR_ID,
    );
  });

  it('retrieves a task by ID', async () => {
    await request(server)
      .get(`/tasks/${TASK_ID}`)
      .set('x-user-id', ACTOR_ID)
      .expect(200);

    expect(mockService.findOne).toHaveBeenCalledWith(TASK_ID, ACTOR_ID);
  });

  it('updates task metadata', async () => {
    const dto = {
      taskName: 'Updated task',
      description: null,
    };

    await request(server)
      .patch(`/tasks/${TASK_ID}`)
      .set('x-user-id', ACTOR_ID)
      .send(dto)
      .expect(200);

    expect(mockService.update).toHaveBeenCalledWith(TASK_ID, dto, ACTOR_ID);
  });

  it('updates task status', async () => {
    const dto = { status: 'IN_PROGRESS' };

    await request(server)
      .patch(`/tasks/${TASK_ID}/status`)
      .set('x-user-id', ACTOR_ID)
      .send(dto)
      .expect(200);

    expect(mockService.updateStatus).toHaveBeenCalledWith(
      TASK_ID,
      dto,
      ACTOR_ID,
    );
  });

  it('assigns a task to a user', async () => {
    const dto = { assignedToId: ASSIGNEE_ID };

    await request(server)
      .patch(`/tasks/${TASK_ID}/assign`)
      .set('x-user-id', ACTOR_ID)
      .send(dto)
      .expect(200);

    expect(mockService.assign).toHaveBeenCalledWith(TASK_ID, dto, ACTOR_ID);
  });

  it('deletes a task', async () => {
    await request(server)
      .delete(`/tasks/${TASK_ID}`)
      .set('x-user-id', ACTOR_ID)
      .expect(200);

    expect(mockService.remove).toHaveBeenCalledWith(TASK_ID, ACTOR_ID);
  });

  it('rejects invalid task creation payloads', async () => {
    await request(server)
      .post('/tasks')
      .set('x-user-id', ACTOR_ID)
      .send({
        projectId: PROJECT_ID,
        taskName: '   ',
        status: 'DELAYED',
      })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects server-managed fields on creation', async () => {
    await request(server)
      .post('/tasks')
      .set('x-user-id', ACTOR_ID)
      .send({
        projectId: PROJECT_ID,
        taskName: 'Prepare materials',
        id: TASK_ID,
      })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects invalid task UUIDs', async () => {
    await request(server)
      .get('/tasks/invalid-id')
      .set('x-user-id', ACTOR_ID)
      .expect(400);

    expect(mockService.findOne).not.toHaveBeenCalled();
  });

  it('rejects invalid project UUIDs', async () => {
    await request(server)
      .get('/projects/invalid-id/tasks')
      .set('x-user-id', ACTOR_ID)
      .expect(400);

    expect(mockService.findByProject).not.toHaveBeenCalled();
  });

  it('rejects invalid pagination parameters', async () => {
    await request(server)
      .get('/tasks')
      .set('x-user-id', ACTOR_ID)
      .query({ page: 0, limit: 101 })
      .expect(400);

    expect(mockService.findAll).not.toHaveBeenCalled();
  });

  it('rejects unsupported task statuses', async () => {
    await request(server)
      .patch(`/tasks/${TASK_ID}/status`)
      .set('x-user-id', ACTOR_ID)
      .send({ status: 'DELAYED' })
      .expect(400);

    expect(mockService.updateStatus).not.toHaveBeenCalled();
  });

  it('rejects invalid assignment IDs', async () => {
    await request(server)
      .patch(`/tasks/${TASK_ID}/assign`)
      .set('x-user-id', ACTOR_ID)
      .send({ assignedToId: 'invalid-id' })
      .expect(400);

    expect(mockService.assign).not.toHaveBeenCalled();
  });

  it('propagates Task Service validation errors', async () => {
    mockService.create.mockRejectedValue(
      new BadRequestException({
        code: 'TASK_MILESTONE_PROJECT_MISMATCH',
        message: 'Milestone belongs to another project.',
      }),
    );

    const response = await request(server)
      .post('/tasks')
      .set('x-user-id', ACTOR_ID)
      .send({
        projectId: PROJECT_ID,
        taskName: 'Foundation',
      })
      .expect(400);

    expect(response.text).toContain('TASK_MILESTONE_PROJECT_MISMATCH');
  });
});
