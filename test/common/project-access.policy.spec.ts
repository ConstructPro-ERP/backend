import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import {
  assertCanModifyProject,
  assertCanReadProject,
  requireProjectActorId,
  resolveProjectActor,
  type ProjectAccessActor,
} from '../../libs/common/src/project-access/project-access.policy';

describe('Shared project access policy', () => {
  const project = {
    id: 'project-1',
    projectManagerId: 'manager-1',
  };

  const admin: ProjectAccessActor = {
    id: 'admin-1',
    role: 'ADMIN',
  };

  const assignedManager: ProjectAccessActor = {
    id: 'manager-1',
    role: 'PROJECT_MANAGER',
  };

  const otherManager: ProjectAccessActor = {
    id: 'manager-2',
    role: 'PROJECT_MANAGER',
  };

  const accountant: ProjectAccessActor = {
    id: 'accountant-1',
    role: 'ACCOUNTANT',
  };

  describe('actor resolution', () => {
    it('rejects a missing actor identifier', () => {
      expect(() => requireProjectActorId()).toThrow(UnauthorizedException);
    });

    it('returns a valid actor identifier', () => {
      expect(requireProjectActorId('admin-1')).toBe('admin-1');
    });

    it('rejects an unknown user', () => {
      expect(() => resolveProjectActor(null)).toThrow(UnauthorizedException);
    });

    it('rejects an inactive user', () => {
      expect(() =>
        resolveProjectActor({
          id: 'manager-1',
          status: UserStatus.INACTIVE,
          role: { roleName: 'PROJECT_MANAGER' },
        }),
      ).toThrow(ForbiddenException);
    });

    it.each(['ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT'])(
      'accepts a valid %s actor',
      (roleName) => {
        expect(
          resolveProjectActor({
            id: 'user-1',
            status: UserStatus.ACTIVE,
            role: { roleName },
          }),
        ).toEqual({
          id: 'user-1',
          role: roleName,
        });
      },
    );

    it('rejects unsupported roles', () => {
      expect(() =>
        resolveProjectActor({
          id: 'client-1',
          status: UserStatus.ACTIVE,
          role: { roleName: 'CLIENT_PORTAL_USER' },
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('read authorization', () => {
    it('allows administrators and accountants', () => {
      expect(() => assertCanReadProject(admin, project)).not.toThrow();
      expect(() => assertCanReadProject(accountant, project)).not.toThrow();
    });

    it('allows the assigned project manager', () => {
      expect(() =>
        assertCanReadProject(assignedManager, project),
      ).not.toThrow();
    });

    it('rejects unrelated project managers', () => {
      expect(() => assertCanReadProject(otherManager, project)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('write authorization', () => {
    it('allows administrators and assigned project managers', () => {
      expect(() => assertCanModifyProject(admin, project)).not.toThrow();

      expect(() =>
        assertCanModifyProject(assignedManager, project),
      ).not.toThrow();
    });

    it('rejects accountants and unrelated managers', () => {
      expect(() => assertCanModifyProject(accountant, project)).toThrow(
        ForbiddenException,
      );

      expect(() => assertCanModifyProject(otherManager, project)).toThrow(
        ForbiddenException,
      );
    });
  });
});
