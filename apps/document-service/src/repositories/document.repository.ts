import { Injectable } from '@nestjs/common';
import { DocumentStorageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface CreatePendingDocumentData {
  id: string;
  projectId: string;
  categoryId: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  cloudinaryPublicId: string;
  cloudinaryResourceType: 'image' | 'raw';
  uploadedById: string;
  description?: string | null;
}

export interface DocumentListArgs {
  projectId: string;
  categoryId?: string;
  search?: string;
  skip: number;
  take: number;
  orderBy: Prisma.DocumentOrderByWithRelationInput[];
}

export interface CreateCategoryData {
  categoryName: string;
  description?: string | null;
}

export interface UpdateCategoryData {
  categoryName?: string;
  description?: string | null;
  isActive?: boolean;
}

// Only expose user-facing metadata in document lists.
// Internal storage identifiers and delivery references stay on the server.
const documentListSelect = {
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
} as const;

@Injectable()
export class DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Used by the document service before creating a reservation.
  findProject(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        projectManagerId: true,
        status: true,
      },
    });
  }

  // Resolve the authenticated actor against current database state.
  findUserWithRole(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        role: {
          select: {
            roleName: true,
          },
        },
      },
    });
  }

  // Only ACTIVE and non-deleted documents are visible to users.
  // The caller must also verify project authorization.
  findActiveById(id: string) {
    return this.prisma.document.findFirst({
      where: {
        id,
        storageStatus: DocumentStorageStatus.ACTIVE,
        deletedAt: null,
      },
    });
  }

  // Internal-only lookup for upload/deletion recovery.
  findByIdForReconciliation(id: string) {
    return this.prisma.document.findUnique({
      where: { id },
    });
  }

  async findManyAndCount(args: DocumentListArgs) {
    const where: Prisma.DocumentWhereInput = {
      projectId: args.projectId,
      storageStatus: DocumentStorageStatus.ACTIVE,
      deletedAt: null,
      ...(args.categoryId ? { categoryId: args.categoryId } : {}),
      ...(args.search
        ? {
            originalName: {
              contains: args.search,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
    };

    return this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        select: documentListSelect,
        skip: args.skip,
        take: args.take,
        orderBy: args.orderBy,
      }),
      this.prisma.document.count({ where }),
    ]);
  }

  // Create metadata before uploading to Cloudinary.
  // Public IDs must be generated on the server, never by the client.
  createPending(data: CreatePendingDocumentData) {
    return this.prisma.document.create({
      data: {
        ...data,
        storageProvider: 'CLOUDINARY',
        fileUrl: null,
        storageStatus: DocumentStorageStatus.PENDING,
        deletedAt: null,
      },
    });
  }

  // Conditional updates prevent stale requests changing completed states.
  markUploadActive(id: string) {
    return this.prisma.document.updateMany({
      where: {
        id,
        storageStatus: DocumentStorageStatus.PENDING,
        deletedAt: null,
      },
      data: {
        storageStatus: DocumentStorageStatus.ACTIVE,
      },
    });
  }

  markUploadFailed(id: string) {
    return this.prisma.document.updateMany({
      where: {
        id,
        storageStatus: DocumentStorageStatus.PENDING,
        deletedAt: null,
      },
      data: {
        storageStatus: DocumentStorageStatus.FAILED,
      },
    });
  }

  beginDelete(id: string) {
    return this.prisma.document.updateMany({
      where: {
        id,
        storageStatus: DocumentStorageStatus.ACTIVE,
        deletedAt: null,
      },
      data: {
        storageStatus: DocumentStorageStatus.DELETING,
      },
    });
  }

  finishDelete(id: string, deletedAt: Date = new Date()) {
    return this.prisma.document.updateMany({
      where: {
        id,
        storageStatus: DocumentStorageStatus.DELETING,
        deletedAt: null,
      },
      data: {
        storageStatus: DocumentStorageStatus.DELETED,
        deletedAt,
      },
    });
  }

  findCategoryById(categoryId: string) {
    return this.prisma.documentCategory.findUnique({
      where: { id: categoryId },
    });
  }

  findActiveCategoryById(categoryId: string) {
    return this.prisma.documentCategory.findFirst({
      where: {
        id: categoryId,
        isActive: true,
      },
    });
  }

  listCategories(includeInactive = false) {
    return this.prisma.documentCategory.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ categoryName: 'asc' }, { id: 'asc' }],
    });
  }

  createCategory(data: CreateCategoryData) {
    return this.prisma.documentCategory.create({ data });
  }

  updateCategory(id: string, data: UpdateCategoryData) {
    return this.prisma.documentCategory.update({
      where: { id },
      data,
    });
  }

  // Always preserve categories referenced by any document, including
  // soft-deleted documents.
  countCategoryDocuments(categoryId: string) {
    return this.prisma.document.count({
      where: { categoryId },
    });
  }

  disableCategory(id: string) {
    return this.prisma.documentCategory.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // The database deletes only if no documents reference the category.
  // The service must handle a concurrent foreign-key conflict as well.
  deleteUnusedCategory(id: string) {
    return this.prisma.documentCategory.deleteMany({
      where: {
        id,
        documents: {
          none: {},
        },
      },
    });
  }
}
