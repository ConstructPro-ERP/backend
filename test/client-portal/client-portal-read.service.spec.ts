import { NotFoundException } from '@nestjs/common';
import { DocumentStorageStatus, Prisma } from '@prisma/client';
import { ClientPortalAccessService } from '../../apps/client-service/src/client-portal-access.service';
import { ClientPortalReadService } from '../../apps/client-service/src/client-portal-read.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ClientPortalReadService', () => {
  const identity = {
    userId: 'user-a',
    customerId: 'customer-a',
  };

  const ownedWhere = {
    quotations: {
      some: { lead: { customer: { is: { id: 'customer-a' } } } },
      every: { lead: { customer: { is: { id: 'customer-a' } } } },
    },
  };

  const prisma = {
    project: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    milestone: {
      findMany: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    quotation: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const access = {
    resolveClient: jest.fn(),
    ownedProjectWhere: jest.fn(),
    assertOwnProject: jest.fn(),
  };

  let service: ClientPortalReadService;

  beforeEach(() => {
    jest.resetAllMocks();

    access.resolveClient.mockResolvedValue(identity);
    access.ownedProjectWhere.mockReturnValue(ownedWhere);
    access.assertOwnProject.mockResolvedValue(undefined);

    service = new ClientPortalReadService(
      prisma as unknown as PrismaService,
      access as unknown as ClientPortalAccessService,
    );
  });

  it('lists only ownership-filtered projects', async () => {
    prisma.project.findMany.mockResolvedValue([{ id: 'project-a' }]);
    prisma.project.count.mockResolvedValue(1);

    const result = await service.findProjects('user-a', {
      page: 1,
      limit: 10,
    });

    expect(result).toMatchObject({
      items: [{ id: 'project-a' }],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    expect(prisma.project.findMany.mock.calls).toMatchObject([
      [
        {
          where: ownedWhere,
          skip: 0,
          take: 10,
        },
      ],
    ]);
  });

  it('uses default pagination for project lists', async () => {
    prisma.project.findMany.mockResolvedValue([]);
    prisma.project.count.mockResolvedValue(0);

    const result = await service.findProjects('user-a', {});

    expect(result).toMatchObject({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });
  });

  it('returns only an authorized project', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'project-a',
      progressPercentage: 45,
    });

    const result = await service.findProject('user-a', 'project-a');

    expect(result).toMatchObject({
      id: 'project-a',
      progressPercentage: 45,
    });

    expect(prisma.project.findFirst.mock.calls).toMatchObject([
      [
        {
          where: {
            id: 'project-a',
            ...ownedWhere,
          },
        },
      ],
    ]);
  });

  it('hides a missing or unauthorized project', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.findProject('user-a', 'project-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires ownership before listing milestones', async () => {
    prisma.milestone.findMany.mockResolvedValue([
      { id: 'milestone-a', progressPercentage: 70 },
    ]);

    const result = await service.findMilestones('user-a', 'project-a');

    expect(result).toHaveLength(1);
    expect(access.assertOwnProject).toHaveBeenCalledWith('project-a', identity);

    expect(prisma.milestone.findMany.mock.calls).toMatchObject([
      [
        {
          where: {
            projectId: 'project-a',
            project: { is: ownedWhere },
          },
        },
      ],
    ]);
  });

  it('lists only active, owned project documents', async () => {
    prisma.document.findMany.mockResolvedValue([{ id: 'document-a' }]);
    prisma.document.count.mockResolvedValue(1);

    const result = await service.findDocuments('user-a', 'project-a', {
      page: 1,
      limit: 10,
    });

    expect(result.total).toBe(1);

    expect(prisma.document.findMany.mock.calls).toMatchObject([
      [
        {
          where: {
            projectId: 'project-a',
            storageStatus: DocumentStorageStatus.ACTIVE,
            deletedAt: null,
            project: { is: ownedWhere },
          },
        },
      ],
    ]);

    const [documentQuery] = prisma.document.findMany.mock
      .calls[0] as unknown as [Prisma.DocumentFindManyArgs];

    const selection = documentQuery.select;

    expect(selection).toBeDefined();
    expect(selection).not.toHaveProperty('fileUrl');
    expect(selection).not.toHaveProperty('cloudinaryPublicId');
    expect(selection).not.toHaveProperty('uploadedById');
  });

  it('does not query documents when project access fails', async () => {
    access.assertOwnProject.mockRejectedValue(
      new NotFoundException('Project not found.'),
    );

    await expect(
      service.findDocuments('user-a', 'project-b', {}),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(prisma.document.count).not.toHaveBeenCalled();
  });

  it('lists only quotations linked to the customer', async () => {
    prisma.quotation.findMany.mockResolvedValue([
      {
        id: 'quotation-a',
        totalAmount: new Prisma.Decimal('125000.50'),
      },
    ]);
    prisma.quotation.count.mockResolvedValue(1);

    const result = await service.findQuotations('user-a', {});

    expect(result.items[0]).toMatchObject({
      id: 'quotation-a',
      totalAmount: '125000.50',
    });

    expect(prisma.quotation.findMany.mock.calls).toMatchObject([
      [
        {
          where: {
            lead: {
              customer: {
                is: { id: 'customer-a' },
              },
            },
          },
        },
      ],
    ]);
  });
});
