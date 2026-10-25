import { BadRequestException } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
import { ProjectLifecycleService } from '../../apps/project-service/src/lifecycle/project-lifecycle.service';
import { ErrorCode } from '../../shared/error-codes';

const allowedTransitions: [ProjectStatus, ProjectStatus][] = [
  [ProjectStatus.PLANNING, ProjectStatus.ACTIVE],
  [ProjectStatus.PLANNING, ProjectStatus.CANCELLED],

  [ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD],
  [ProjectStatus.ACTIVE, ProjectStatus.COMPLETED],
  [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],

  [ProjectStatus.ON_HOLD, ProjectStatus.ACTIVE],
  [ProjectStatus.ON_HOLD, ProjectStatus.CANCELLED],
];

const deniedTransitions: [ProjectStatus, ProjectStatus][] = [
  [ProjectStatus.PLANNING, ProjectStatus.PLANNING],
  [ProjectStatus.PLANNING, ProjectStatus.ON_HOLD],
  [ProjectStatus.PLANNING, ProjectStatus.COMPLETED],

  [ProjectStatus.ACTIVE, ProjectStatus.PLANNING],
  [ProjectStatus.ACTIVE, ProjectStatus.ACTIVE],

  [ProjectStatus.ON_HOLD, ProjectStatus.PLANNING],
  [ProjectStatus.ON_HOLD, ProjectStatus.ON_HOLD],
  [ProjectStatus.ON_HOLD, ProjectStatus.COMPLETED],

  [ProjectStatus.COMPLETED, ProjectStatus.PLANNING],
  [ProjectStatus.COMPLETED, ProjectStatus.ACTIVE],
  [ProjectStatus.COMPLETED, ProjectStatus.ON_HOLD],
  [ProjectStatus.COMPLETED, ProjectStatus.COMPLETED],
  [ProjectStatus.COMPLETED, ProjectStatus.CANCELLED],

  [ProjectStatus.CANCELLED, ProjectStatus.PLANNING],
  [ProjectStatus.CANCELLED, ProjectStatus.ACTIVE],
  [ProjectStatus.CANCELLED, ProjectStatus.ON_HOLD],
  [ProjectStatus.CANCELLED, ProjectStatus.COMPLETED],
  [ProjectStatus.CANCELLED, ProjectStatus.CANCELLED],
];

describe('ProjectLifecycleService', () => {
  const service = new ProjectLifecycleService();

  it.each(allowedTransitions)(
    'allows %s -> %s',
    (currentStatus, requestedStatus) => {
      expect(() =>
        service.assertTransitionAllowed(currentStatus, requestedStatus),
      ).not.toThrow();
    },
  );

  it.each(deniedTransitions)(
    'rejects %s -> %s',
    (currentStatus, requestedStatus) => {
      expect(() =>
        service.assertTransitionAllowed(currentStatus, requestedStatus),
      ).toThrow(BadRequestException);
    },
  );

  it('returns a stable error for an invalid transition', () => {
    expect.assertions(2);

    try {
      service.assertTransitionAllowed(
        ProjectStatus.ACTIVE,
        ProjectStatus.PLANNING,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);

      expect((error as BadRequestException).getResponse()).toEqual({
        code: ErrorCode.INVALID_PROJECT_STATUS_TRANSITION,
        message: 'Project status cannot change from ACTIVE to PLANNING.',
        details: {
          currentStatus: ProjectStatus.ACTIVE,
          requestedStatus: ProjectStatus.PLANNING,
        },
      });
    }
  });
});
