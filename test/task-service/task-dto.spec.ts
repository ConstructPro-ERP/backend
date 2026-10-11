import { TaskStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AssignTaskDto } from '../../apps/task-service/src/dto/assign-task.dto';
import { CreateTaskDto } from '../../apps/task-service/src/dto/create-task.dto';
import {
  TaskQueryDto,
  TaskSortField,
  TaskSortOrder,
} from '../../apps/task-service/src/dto/task-query.dto';
import { UpdateTaskStatusDto } from '../../apps/task-service/src/dto/update-task-status.dto';
import { UpdateTaskDto } from '../../apps/task-service/src/dto/update-task.dto';

const projectId = 'b390c2c8-86f5-484f-ad9f-170bca22703d';
const userId = 'f5ff5c48-922c-4f43-b49b-9330f422d041';

function validateDto<T extends object>(
  dtoClass: new () => T,
  payload: Record<string, unknown>,
): string[] {
  const dto = plainToInstance(dtoClass, payload);

  return validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((error) => error.property);
}

describe('Task DTO validation', () => {
  describe('CreateTaskDto', () => {
    const validCreate = {
      projectId,
      taskName: 'Prepare foundation materials',
    };

    it('accepts project-level tasks', () => {
      expect(validateDto(CreateTaskDto, validCreate)).toEqual([]);
    });

    it('accepts valid optional fields', () => {
      expect(
        validateDto(CreateTaskDto, {
          ...validCreate,
          milestoneId: projectId,
          assignedToId: userId,
          description: 'Prepare required materials',
          dueDate: '2026-12-31T00:00:00.000Z',
          status: TaskStatus.IN_PROGRESS,
        }),
      ).toEqual([]);
    });

    it('accepts nullable optional fields', () => {
      expect(
        validateDto(CreateTaskDto, {
          ...validCreate,
          milestoneId: null,
          assignedToId: null,
          description: null,
          dueDate: null,
        }),
      ).toEqual([]);
    });

    it('rejects missing or invalid project IDs', () => {
      expect(
        validateDto(CreateTaskDto, {
          taskName: 'Test',
        }),
      ).toContain('projectId');

      expect(
        validateDto(CreateTaskDto, {
          ...validCreate,
          projectId: 'invalid',
        }),
      ).toContain('projectId');
    });

    it.each(['', '   ', null])('rejects blank task names: %s', (taskName) => {
      expect(
        validateDto(CreateTaskDto, {
          ...validCreate,
          taskName,
        }),
      ).toContain('taskName');
    });

    it('rejects invalid optional values', () => {
      expect(
        validateDto(CreateTaskDto, {
          ...validCreate,
          assignedToId: 'invalid',
          dueDate: 'invalid-date',
          status: 'DELAYED',
        }),
      ).toEqual(expect.arrayContaining(['assignedToId', 'dueDate', 'status']));
    });

    it('rejects server-managed fields', () => {
      expect(
        validateDto(CreateTaskDto, {
          ...validCreate,
          id: userId,
          createdAt: '2026-10-09',
        }),
      ).toEqual(expect.arrayContaining(['id', 'createdAt']));
    });
  });

  describe('UpdateTaskDto', () => {
    it('accepts valid partial updates', () => {
      expect(
        validateDto(UpdateTaskDto, {
          taskName: 'Updated task',
          description: 'Updated scope',
        }),
      ).toEqual([]);
    });

    it('accepts clearing nullable fields', () => {
      expect(
        validateDto(UpdateTaskDto, {
          description: null,
          dueDate: null,
          milestoneId: null,
        }),
      ).toEqual([]);
    });

    it('rejects invalid task names and dates', () => {
      expect(
        validateDto(UpdateTaskDto, {
          taskName: '  ',
          dueDate: 'invalid',
        }),
      ).toEqual(expect.arrayContaining(['taskName', 'dueDate']));
    });

    it('rejects assignment and status changes', () => {
      expect(
        validateDto(UpdateTaskDto, {
          assignedToId: userId,
          status: TaskStatus.COMPLETED,
          projectId,
        }),
      ).toEqual(
        expect.arrayContaining(['assignedToId', 'status', 'projectId']),
      );
    });
  });

  describe('UpdateTaskStatusDto', () => {
    it.each(Object.values(TaskStatus))('accepts valid status %s', (status) => {
      expect(validateDto(UpdateTaskStatusDto, { status })).toEqual([]);
    });

    it('rejects invalid or missing status', () => {
      expect(validateDto(UpdateTaskStatusDto, {})).toContain('status');

      expect(
        validateDto(UpdateTaskStatusDto, {
          status: 'DELAYED',
        }),
      ).toContain('status');
    });
  });

  describe('AssignTaskDto', () => {
    it('accepts a valid user ID', () => {
      expect(
        validateDto(AssignTaskDto, {
          assignedToId: userId,
        }),
      ).toEqual([]);
    });

    it.each([null, 'invalid', undefined])(
      'rejects invalid assignee %s',
      (assignedToId) => {
        expect(
          validateDto(AssignTaskDto, {
            assignedToId,
          }),
        ).toContain('assignedToId');
      },
    );
  });

  describe('TaskQueryDto', () => {
    it('accepts filtering and sorting', () => {
      expect(
        validateDto(TaskQueryDto, {
          projectId,
          assignedToId: userId,
          status: TaskStatus.TODO,
          page: '2',
          limit: '20',
          sortBy: TaskSortField.DUE_DATE,
          sortOrder: TaskSortOrder.ASC,
        }),
      ).toEqual([]);
    });

    it.each([0, -1, 1.5, 'invalid'])('rejects invalid page %s', (page) => {
      expect(validateDto(TaskQueryDto, { page })).toContain('page');
    });

    it.each([0, -1, 101, 2.5, 'invalid'])(
      'rejects invalid limit %s',
      (limit) => {
        expect(validateDto(TaskQueryDto, { limit })).toContain('limit');
      },
    );

    it('rejects invalid status and sorting', () => {
      expect(
        validateDto(TaskQueryDto, {
          status: 'DELAYED',
          sortBy: 'unknown',
          sortOrder: 'up',
        }),
      ).toEqual(expect.arrayContaining(['status', 'sortBy', 'sortOrder']));
    });
  });
});
