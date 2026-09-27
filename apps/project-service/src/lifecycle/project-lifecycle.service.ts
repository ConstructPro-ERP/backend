import { BadRequestException, Injectable } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
import { ErrorCode } from '../../../../shared/error-codes';

const ALLOWED_PROJECT_STATUS_TRANSITIONS: Record<
  ProjectStatus,
  ProjectStatus[]
> = {
  [ProjectStatus.PLANNING]: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],

  [ProjectStatus.ACTIVE]: [
    ProjectStatus.ON_HOLD,
    ProjectStatus.COMPLETED,
    ProjectStatus.CANCELLED,
  ],

  [ProjectStatus.ON_HOLD]: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],

  [ProjectStatus.COMPLETED]: [],

  [ProjectStatus.CANCELLED]: [],
};

@Injectable()
export class ProjectLifecycleService {
  assertTransitionAllowed(
    currentStatus: ProjectStatus,
    requestedStatus: ProjectStatus,
  ): void {
    const allowedStatuses = ALLOWED_PROJECT_STATUS_TRANSITIONS[currentStatus];

    if (allowedStatuses.includes(requestedStatus)) {
      return;
    }

    throw new BadRequestException({
      code: ErrorCode.INVALID_PROJECT_STATUS_TRANSITION,
      message: `Project status cannot change from ${currentStatus} to ${requestedStatus}.`,
      details: {
        currentStatus,
        requestedStatus,
      },
    });
  }
}
