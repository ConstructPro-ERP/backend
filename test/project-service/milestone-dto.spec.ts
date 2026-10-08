import { MilestoneStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateMilestoneDto } from '../../apps/project-service/src/dto/create-milestone.dto';
import { UpdateMilestoneDto } from '../../apps/project-service/src/dto/update-milestone.dto';
import { UpdateMilestoneProgressDto } from '../../apps/project-service/src/dto/update-milestone-progress.dto';

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

describe('Milestone DTO validation', () => {
  const validCreate = {
    milestoneName: 'Foundation Construction',
    weight: 5,
  };

  describe('CreateMilestoneDto', () => {
    it('accepts valid required fields', () => {
      expect(validateDto(CreateMilestoneDto, validCreate)).toEqual([]);
    });

    it('accepts valid optional fields', () => {
      expect(
        validateDto(CreateMilestoneDto, {
          ...validCreate,
          description: 'Foundation work',
          dueDate: '2026-12-31T00:00:00.000Z',
          progressPercentage: 50,
          status: MilestoneStatus.IN_PROGRESS,
        }),
      ).toEqual([]);
    });

    it('rejects missing milestone name', () => {
      expect(validateDto(CreateMilestoneDto, { weight: 5 })).toContain(
        'milestoneName',
      );
    });

    it('rejects blank milestone name', () => {
      expect(
        validateDto(CreateMilestoneDto, {
          ...validCreate,
          milestoneName: '   ',
        }),
      ).toContain('milestoneName');
    });

    it.each([0, -1, 11, 1.5, '5', null])(
      'rejects invalid weight %s',
      (weight) => {
        expect(
          validateDto(CreateMilestoneDto, {
            ...validCreate,
            weight,
          }),
        ).toContain('weight');
      },
    );

    it.each([1, 5, 10])('accepts relative weight %s', (weight) => {
      expect(
        validateDto(CreateMilestoneDto, {
          ...validCreate,
          weight,
        }),
      ).toEqual([]);
    });

    it('rejects invalid due dates', () => {
      expect(
        validateDto(CreateMilestoneDto, {
          ...validCreate,
          dueDate: 'not-a-date',
        }),
      ).toContain('dueDate');
    });

    it('rejects invalid progress', () => {
      expect(
        validateDto(CreateMilestoneDto, {
          ...validCreate,
          progressPercentage: 101,
        }),
      ).toContain('progressPercentage');
    });

    it('rejects invalid milestone status', () => {
      expect(
        validateDto(CreateMilestoneDto, {
          ...validCreate,
          status: 'DELAYED',
        }),
      ).toContain('status');
    });

    it('rejects server-managed fields', () => {
      expect(
        validateDto(CreateMilestoneDto, {
          ...validCreate,
          projectId: 'some-project',
          completedAt: '2026-12-31T00:00:00.000Z',
        }),
      ).toEqual(expect.arrayContaining(['projectId', 'completedAt']));
    });
  });

  describe('UpdateMilestoneDto', () => {
    it('accepts valid partial updates', () => {
      expect(
        validateDto(UpdateMilestoneDto, {
          milestoneName: 'Revised Foundation',
          weight: 7,
        }),
      ).toEqual([]);
    });

    it('allows clearing nullable fields', () => {
      expect(
        validateDto(UpdateMilestoneDto, {
          description: null,
          dueDate: null,
        }),
      ).toEqual([]);
    });

    it.each([0, -1, 11, 2.5, '5', null])(
      'rejects invalid weight %s',
      (weight) => {
        expect(validateDto(UpdateMilestoneDto, { weight })).toContain('weight');
      },
    );

    it('rejects blank milestone name', () => {
      expect(
        validateDto(UpdateMilestoneDto, {
          milestoneName: ' ',
        }),
      ).toContain('milestoneName');
    });
  });

  describe('UpdateMilestoneProgressDto', () => {
    it('accepts progress at both boundaries', () => {
      expect(
        validateDto(UpdateMilestoneProgressDto, {
          progressPercentage: 0,
        }),
      ).toEqual([]);

      expect(
        validateDto(UpdateMilestoneProgressDto, {
          progressPercentage: 100,
          status: MilestoneStatus.COMPLETED,
        }),
      ).toEqual([]);
    });

    it.each([-1, 101, '50', null])(
      'rejects invalid progress %s',
      (progressPercentage) => {
        expect(
          validateDto(UpdateMilestoneProgressDto, {
            progressPercentage,
          }),
        ).toContain('progressPercentage');
      },
    );

    it('rejects missing progress', () => {
      expect(validateDto(UpdateMilestoneProgressDto, {})).toContain(
        'progressPercentage',
      );
    });

    it('rejects invalid status', () => {
      expect(
        validateDto(UpdateMilestoneProgressDto, {
          progressPercentage: 50,
          status: 'DELAYED',
        }),
      ).toContain('status');
    });
  });
});
