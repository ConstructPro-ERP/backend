import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectAccessService } from '../../apps/project-service/src/project-access.service';
import { ProjectRepository } from '../../apps/project-service/src/repositories/project.repository';

const mockProjectRepository = {
  findUserWithRole: jest.fn(),
};

describe('ProjectAccessService', () => {
  let service: ProjectAccessService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectAccessService,
        {
          provide: ProjectRepository,
          useValue: mockProjectRepository,
        },
      ],
    }).compile();

    service = module.get<ProjectAccessService>(ProjectAccessService);
  });

  describe('resolveActor', () => {
    it('rejects missing actor ID', async () => {
      await expect(service.resolveActor()).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects unknown actor', async () => {
      mockProjectRepository.findUserWithRole.mockResolvedValue(null);

      await expect(service.resolveActor('missing-user')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects inactive actor', async () => {
      mockProjectRepository.findUserWithRole.mockResolvedValue({
        id: 'manager-1',
        status: UserStatus.INACTIVE,
        role: {
          roleName: 'PROJECT_MANAGER',
        },
      });

      await expect(service.resolveActor('manager-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects SALES_MANAGER', async () => {
      mockProjectRepository.findUserWithRole.mockResolvedValue({
        id: 'sales-1',
        status: UserStatus.ACTIVE,
        role: {
          roleName: 'SALES_MANAGER',
        },
      });

      await expect(service.resolveActor('sales-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects CLIENT_PORTAL_USER', async () => {
      mockProjectRepository.findUserWithRole.mockResolvedValue({
        id: 'client-1',
        status: UserStatus.ACTIVE,
        role: {
          roleName: 'CLIENT_PORTAL_USER',
        },
      });

      await expect(service.resolveActor('client-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('resolves ADMIN', async () => {
      mockProjectRepository.findUserWithRole.mockResolvedValue({
        id: 'admin-1',
        status: UserStatus.ACTIVE,
        role: {
          roleName: 'ADMIN',
        },
      });

      await expect(service.resolveActor('admin-1')).resolves.toEqual({
        id: 'admin-1',
        role: 'ADMIN',
      });
    });

    it('resolves PROJECT_MANAGER', async () => {
      mockProjectRepository.findUserWithRole.mockResolvedValue({
        id: 'manager-1',
        status: UserStatus.ACTIVE,
        role: {
          roleName: 'PROJECT_MANAGER',
        },
      });

      await expect(service.resolveActor('manager-1')).resolves.toEqual({
        id: 'manager-1',
        role: 'PROJECT_MANAGER',
      });
    });

    it('resolves ACCOUNTANT', async () => {
      mockProjectRepository.findUserWithRole.mockResolvedValue({
        id: 'accountant-1',
        status: UserStatus.ACTIVE,
        role: {
          roleName: 'ACCOUNTANT',
        },
      });

      await expect(service.resolveActor('accountant-1')).resolves.toEqual({
        id: 'accountant-1',
        role: 'ACCOUNTANT',
      });
    });
  });

  describe('read authorization', () => {
    it('allows ADMIN to read any project', () => {
      expect(() =>
        service.assertCanReadProject(
          {
            id: 'admin-1',
            role: 'ADMIN',
          },
          {
            id: 'project-1',
            projectManagerId: 'manager-1',
          },
        ),
      ).not.toThrow();
    });

    it('allows ACCOUNTANT to read any project', () => {
      expect(() =>
        service.assertCanReadProject(
          {
            id: 'accountant-1',
            role: 'ACCOUNTANT',
          },
          {
            id: 'project-1',
            projectManagerId: 'manager-1',
          },
        ),
      ).not.toThrow();
    });

    it('allows assigned PROJECT_MANAGER to read project', () => {
      expect(() =>
        service.assertCanReadProject(
          {
            id: 'manager-1',
            role: 'PROJECT_MANAGER',
          },
          {
            id: 'project-1',
            projectManagerId: 'manager-1',
          },
        ),
      ).not.toThrow();
    });

    it('rejects PROJECT_MANAGER reading another managers project', () => {
      expect(() =>
        service.assertCanReadProject(
          {
            id: 'manager-1',
            role: 'PROJECT_MANAGER',
          },
          {
            id: 'project-1',
            projectManagerId: 'manager-2',
          },
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('write authorization', () => {
    it('allows ADMIN to modify any project', () => {
      expect(() =>
        service.assertCanModifyProject(
          {
            id: 'admin-1',
            role: 'ADMIN',
          },
          {
            id: 'project-1',
            projectManagerId: 'manager-1',
          },
        ),
      ).not.toThrow();
    });

    it('allows assigned PROJECT_MANAGER to modify project', () => {
      expect(() =>
        service.assertCanModifyProject(
          {
            id: 'manager-1',
            role: 'PROJECT_MANAGER',
          },
          {
            id: 'project-1',
            projectManagerId: 'manager-1',
          },
        ),
      ).not.toThrow();
    });

    it('rejects PROJECT_MANAGER modifying another managers project', () => {
      expect(() =>
        service.assertCanModifyProject(
          {
            id: 'manager-1',
            role: 'PROJECT_MANAGER',
          },
          {
            id: 'project-1',
            projectManagerId: 'manager-2',
          },
        ),
      ).toThrow(ForbiddenException);
    });

    it('rejects ACCOUNTANT from modifying project', () => {
      expect(() =>
        service.assertCanModifyProject(
          {
            id: 'accountant-1',
            role: 'ACCOUNTANT',
          },
          {
            id: 'project-1',
            projectManagerId: 'manager-1',
          },
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('admin operations', () => {
    it('allows ADMIN to create project', () => {
      expect(() =>
        service.assertCanCreateProject({
          id: 'admin-1',
          role: 'ADMIN',
        }),
      ).not.toThrow();
    });

    it('rejects PROJECT_MANAGER from project creation', () => {
      expect(() =>
        service.assertCanCreateProject({
          id: 'manager-1',
          role: 'PROJECT_MANAGER',
        }),
      ).toThrow(ForbiddenException);
    });

    it('allows ADMIN to assign project manager', () => {
      expect(() =>
        service.assertCanAssignProjectManager({
          id: 'admin-1',
          role: 'ADMIN',
        }),
      ).not.toThrow();
    });

    it('rejects PROJECT_MANAGER from manager assignment', () => {
      expect(() =>
        service.assertCanAssignProjectManager({
          id: 'manager-1',
          role: 'PROJECT_MANAGER',
        }),
      ).toThrow(ForbiddenException);
    });
  });
});
