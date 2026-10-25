import { DocumentStorageStatus, Prisma } from '@prisma/client';
import {
  DocumentRepository,
  type CreatePendingDocumentData,
} from '../../apps/document-service/src/repositories/document.repository';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  $transaction: jest.fn(),
  project: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  document: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  documentCategory: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('DocumentRepository', () => {
  let repository: DocumentRepository;

  beforeEach(() => {
    jest.resetAllMocks();

    repository = new DocumentRepository(mockPrisma as unknown as PrismaService);

    mockPrisma.$transaction.mockImplementation(
      (operations: Promise<unknown>[]) => Promise.all(operations),
    );
  });

  it('retrieves the project required for authorization', async () => {
    await repository.findProject('project-1');

    expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      select: {
        id: true,
        projectManagerId: true,
        status: true,
      },
    });
  });

  it('retrieves the current user role and status', async () => {
    await repository.findUserWithRole('user-1');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        status: true,
        role: {
          select: { roleName: true },
        },
      },
    });
  });

  it('retrieves the linked customer for a client portal user', async () => {
    await repository.findClientPortalUser('client-user-1');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'client-user-1' },
      select: {
        id: true,
        status: true,
        role: {
          select: { roleName: true },
        },
        customer: {
          select: { id: true },
        },
      },
    });
  });

  it('restricts downloads to active documents in exclusively owned projects', async () => {
    await repository.findActiveForClient('doc-1', 'customer-1');

    const ownedQuotation = {
      lead: {
        customer: {
          is: { id: 'customer-1' },
        },
      },
    };

    expect(mockPrisma.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        storageStatus: DocumentStorageStatus.ACTIVE,
        deletedAt: null,
        project: {
          is: {
            quotations: {
              some: ownedQuotation,
              every: ownedQuotation,
            },
          },
        },
      },
    });
  });

  it('lists only active, non-deleted project documents', async () => {
    mockPrisma.document.findMany.mockResolvedValue([{ id: 'doc-1' }]);
    mockPrisma.document.count.mockResolvedValue(1);

    const orderBy: Prisma.DocumentOrderByWithRelationInput[] = [
      { createdAt: 'desc' },
      { id: 'asc' },
    ];

    const result = await repository.findManyAndCount({
      projectId: 'project-1',
      categoryId: 'category-1',
      search: 'contract',
      skip: 10,
      take: 10,
      orderBy,
    });

    expect(result).toEqual([[{ id: 'doc-1' }], 1]);

    const where = {
      projectId: 'project-1',
      categoryId: 'category-1',
      storageStatus: DocumentStorageStatus.ACTIVE,
      deletedAt: null,
      fileName: {
        contains: 'contract',
        mode: Prisma.QueryMode.insensitive,
      },
    };

    expect(mockPrisma.document.findMany).toHaveBeenCalledWith({
      where,
      skip: 10,
      take: 10,
      orderBy,
      select: {
        id: true,
        projectId: true,
        categoryId: true,
        originalName: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        description: true,
        uploadedById: true,
        createdAt: true,
        updatedAt: true,
        category: {
          select: {
            id: true,
            categoryName: true,
          },
        },
        uploadedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    expect(mockPrisma.document.count).toHaveBeenCalledWith({ where });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps project and active-state filters without search', async () => {
    await repository.findManyAndCount({
      projectId: 'project-2',
      skip: 0,
      take: 10,
      orderBy: [{ createdAt: 'desc' }],
    });

    expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: 'project-2',
          storageStatus: DocumentStorageStatus.ACTIVE,
          deletedAt: null,
        },
      }),
    );
  });

  it('retrieves active document details including uploader and category', async () => {
    await repository.findActiveById('doc-1');

    expect(mockPrisma.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        storageStatus: DocumentStorageStatus.ACTIVE,
        deletedAt: null,
      },
      include: {
        category: {
          select: {
            id: true,
            categoryName: true,
          },
        },
        uploadedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });
  });

  it('retrieves internal metadata for recovery operations', async () => {
    await repository.findByIdForReconciliation('doc-1');

    expect(mockPrisma.document.findUnique).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
    });
  });

  it('updates only editable metadata on active documents', async () => {
    await repository.updateMetadata('doc-1', {
      fileName: 'Approved Contract.pdf',
      categoryId: 'category-2',
      description: null,
    });

    expect(mockPrisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        storageStatus: DocumentStorageStatus.ACTIVE,
        deletedAt: null,
      },
      data: {
        fileName: 'Approved Contract.pdf',
        categoryId: 'category-2',
        description: null,
      },
    });
  });

  it('creates a PENDING document with server-controlled storage fields', async () => {
    const data: CreatePendingDocumentData = {
      id: 'doc-1',
      projectId: 'project-1',
      categoryId: 'category-1',
      originalName: 'contract.pdf',
      fileName: 'contract.pdf',
      mimeType: 'application/pdf',
      fileSize: 512,
      cloudinaryPublicId: 'constructpro/projects/project-1/doc-1.pdf',
      cloudinaryResourceType: 'raw',
      uploadedById: 'user-1',
    };

    await repository.createPending(data);

    expect(mockPrisma.document.create).toHaveBeenCalledWith({
      data: {
        ...data,
        storageProvider: 'CLOUDINARY',
        fileUrl: null,
        storageStatus: DocumentStorageStatus.PENDING,
        deletedAt: null,
      },
    });
  });

  it('activates only pending documents', async () => {
    await repository.markUploadActive('doc-1');

    expect(mockPrisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        storageStatus: DocumentStorageStatus.PENDING,
        deletedAt: null,
      },
      data: {
        storageStatus: DocumentStorageStatus.ACTIVE,
      },
    });
  });

  it('marks pending uploads as failed', async () => {
    await repository.markUploadFailed('doc-1');

    expect(mockPrisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        storageStatus: DocumentStorageStatus.PENDING,
        deletedAt: null,
      },
      data: {
        storageStatus: DocumentStorageStatus.FAILED,
      },
    });
  });

  it('starts deletion only for active documents', async () => {
    await repository.beginDelete('doc-1');

    expect(mockPrisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        storageStatus: DocumentStorageStatus.ACTIVE,
        deletedAt: null,
      },
      data: {
        storageStatus: DocumentStorageStatus.DELETING,
      },
    });
  });

  it('completes a deletion with a soft-delete timestamp', async () => {
    const deletedAt = new Date('2026-10-11T10:00:00.000Z');

    await repository.finishDelete('doc-1', deletedAt);

    expect(mockPrisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        storageStatus: DocumentStorageStatus.DELETING,
        deletedAt: null,
      },
      data: {
        storageStatus: DocumentStorageStatus.DELETED,
        deletedAt,
      },
    });
  });

  it('retrieves a category by ID regardless of active status', async () => {
    await repository.findCategoryById('category-1');

    expect(mockPrisma.documentCategory.findUnique).toHaveBeenCalledWith({
      where: { id: 'category-1' },
    });
  });

  it('looks up only active categories for uploads', async () => {
    await repository.findActiveCategoryById('category-1');

    expect(mockPrisma.documentCategory.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'category-1',
        isActive: true,
      },
    });
  });

  it('lists active categories by default', async () => {
    await repository.listCategories();

    expect(mockPrisma.documentCategory.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ categoryName: 'asc' }, { id: 'asc' }],
    });
  });

  it('allows administrative listing of inactive categories', async () => {
    await repository.listCategories(true);

    expect(mockPrisma.documentCategory.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: [{ categoryName: 'asc' }, { id: 'asc' }],
    });
  });

  it('creates and updates categories', async () => {
    const createData = {
      categoryName: 'Contracts',
      description: 'Project contracts',
    };

    const updateData = {
      categoryName: 'Signed Contracts',
      isActive: false,
    };

    await repository.createCategory(createData);
    await repository.updateCategory('category-1', updateData);

    expect(mockPrisma.documentCategory.create).toHaveBeenCalledWith({
      data: createData,
    });

    expect(mockPrisma.documentCategory.update).toHaveBeenCalledWith({
      where: { id: 'category-1' },
      data: updateData,
    });
  });

  it('disables categories without deleting historical references', async () => {
    await repository.disableCategory('category-1');

    expect(mockPrisma.documentCategory.update).toHaveBeenCalledWith({
      where: { id: 'category-1' },
      data: { isActive: false },
    });

    expect(mockPrisma.documentCategory.deleteMany).not.toHaveBeenCalled();
  });

  it('counts all documents referencing a category', async () => {
    await repository.countCategoryDocuments('category-1');

    expect(mockPrisma.document.count).toHaveBeenCalledWith({
      where: { categoryId: 'category-1' },
    });
  });

  it('deletes a category only when it has no document references', async () => {
    await repository.deleteUnusedCategory('category-1');

    expect(mockPrisma.documentCategory.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'category-1',
        documents: { none: {} },
      },
    });
  });

  it('finds stale records across all recovery states', async () => {
    const cutoff = new Date('2026-10-11T10:00:00.000Z');

    mockPrisma.document.findMany.mockResolvedValue([]);

    await repository.findStaleForReconciliation(cutoff, 25);

    const statuses = [
      DocumentStorageStatus.DELETING,
      DocumentStorageStatus.FAILED,
      DocumentStorageStatus.PENDING,
    ];

    expect(mockPrisma.document.findMany).toHaveBeenCalledTimes(3);

    statuses.forEach((storageStatus, index) => {
      expect(mockPrisma.document.findMany).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({
          where: {
            storageStatus,
            deletedAt: null,
            updatedAt: { lt: cutoff },
          },
          take: index === 0 ? 9 : 8,
        }),
      );
    });
  });

  it('marks cleaned failed uploads without removing history', async () => {
    await repository.markFailedCleaned('doc-1');

    expect(mockPrisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        storageStatus: DocumentStorageStatus.FAILED,
        deletedAt: null,
      },
      data: {
        deletedAt: expect.any(Date) as Date,
      },
    });
  });
});
