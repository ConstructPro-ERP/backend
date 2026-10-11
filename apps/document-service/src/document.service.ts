import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DocumentStorageStatus, ProjectStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  CloudinaryService,
  type AuthenticatedUploadResult,
  type DocumentResourceType,
} from '../../../libs/common/src/cloudinary/cloudinary.service';
import {
  assertCanModifyProject,
  assertCanReadProject,
  requireProjectActorId,
  resolveProjectActor,
  type ProjectAccessActor,
} from '../../../libs/common/src/project-access/project-access.policy';
import { ErrorCode } from '../../../shared/error-codes';
import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';
import {
  DocumentQueryDto,
  DocumentSortField,
  DocumentSortOrder,
} from './dto/document-query.dto';
import { UpdateDocumentCategoryDto } from './dto/update-document-category.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentRepository } from './repositories/document.repository';
import {
  validateDocumentFile,
  type UploadedDocumentFile,
} from './validation/document-file.validator';

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly documents: DocumentRepository,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async upload(
    projectId: string,
    dto: UploadDocumentDto,
    file: UploadedDocumentFile | undefined,
    actorId?: string,
  ) {
    const actor = await this.resolveActor(actorId);
    const project = await this.getProject(projectId);

    assertCanModifyProject(actor, project);

    if (
      project.status === ProjectStatus.COMPLETED ||
      project.status === ProjectStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Documents cannot be uploaded to completed or cancelled projects.',
      );
    }

    if (!file) {
      throw new BadRequestException({
        code: ErrorCode.DOCUMENT_INVALID_FILE,
        message: 'A valid document file is required.',
      });
    }

    const validated = validateDocumentFile(file);
    const category = await this.documents.findActiveCategoryById(
      dto.categoryId,
    );

    if (!category) {
      this.throwCategoryNotFound();
    }

    const id = randomUUID();
    const resourceType = validated.resourceType;
    const publicId =
      `constructpro/projects/${projectId}/${id}` +
      (resourceType === 'raw' ? validated.extension : '');

    await this.documents.createPending({
      id,
      projectId,
      categoryId: dto.categoryId,
      originalName: validated.originalName,
      fileName: validated.originalName,
      mimeType: validated.mimeType,
      fileSize: validated.fileSize,
      cloudinaryPublicId: publicId,
      cloudinaryResourceType: resourceType,
      uploadedById: actor.id,
      description: dto.description ?? null,
    });

    let uploaded: AuthenticatedUploadResult;

    try {
      uploaded = await this.cloudinary.uploadAuthenticatedBuffer(
        file.buffer,
        publicId,
        resourceType,
      );
    } catch (error: unknown) {
      this.logFailure(
        `Authenticated upload outcome is uncertain for document ${id}`,
        error,
      );

      throw new ServiceUnavailableException(
        'Document upload could not be confirmed. Recovery is required.',
      );
    }

    if (
      uploaded.publicId !== publicId ||
      uploaded.resourceType !== resourceType ||
      uploaded.bytes !== validated.fileSize
    ) {
      await this.compensateInvalidUpload(id, publicId, resourceType);

      throw new ConflictException(
        'Document storage returned inconsistent metadata.',
      );
    }

    let activated: { count: number };

    try {
      activated = await this.documents.markUploadActive(id);
    } catch (error: unknown) {
      this.logFailure(
        `Document ${id} was uploaded but activation could not be confirmed`,
        error,
      );

      throw new ServiceUnavailableException(
        'Document storage succeeded but metadata activation requires recovery.',
      );
    }

    if (activated.count !== 1) {
      this.logger.error(
        `Document ${id} activation affected ${activated.count} records`,
      );

      throw new ConflictException(
        'Document metadata activation requires reconciliation.',
      );
    }

    return this.findOne(id, actor.id);
  }

  async findAll(projectId: string, query: DocumentQueryDto, actorId?: string) {
    const actor = await this.resolveActor(actorId);
    const project = await this.getProject(projectId);

    assertCanReadProject(actor, project);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sortBy = query.sortBy ?? DocumentSortField.CREATED_AT;
    const sortOrder = query.sortOrder ?? DocumentSortOrder.DESC;

    const [data, total] = await this.documents.findManyAndCount({
      projectId,
      categoryId: query.categoryId,
      search: query.search,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, actorId?: string) {
    const actor = await this.resolveActor(actorId);
    const document = await this.documents.findActiveById(id);

    if (!document) {
      this.throwDocumentNotFound();
    }

    const project = await this.getProject(document.projectId);
    assertCanReadProject(actor, project);

    return {
      id: document.id,
      projectId: document.projectId,
      categoryId: document.categoryId,
      originalName: document.originalName,
      fileName: document.fileName,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      description: document.description,
      uploadedById: document.uploadedById,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  async download(id: string, actorId?: string) {
    const actor = await this.resolveActor(actorId);
    const document = await this.documents.findActiveById(id);

    if (!document) {
      this.throwDocumentNotFound();
    }

    const project = await this.getProject(document.projectId);
    assertCanReadProject(actor, project);

    const resourceType = this.getResourceType(document.cloudinaryResourceType);
    const format = extname(document.originalName).slice(1).toLowerCase();

    try {
      return {
        downloadUrl: this.cloudinary.createAuthenticatedDownloadUrl(
          document.cloudinaryPublicId,
          format,
          resourceType,
        ),
        expiresInSeconds: 300,
      };
    } catch (error: unknown) {
      this.logFailure(
        `Unable to generate an authenticated download for document ${id}`,
        error,
      );

      throw new ServiceUnavailableException(
        'Document download is temporarily unavailable.',
      );
    }
  }

  async remove(id: string, actorId?: string) {
    const actor = await this.resolveActor(actorId);
    const document = await this.documents.findByIdForReconciliation(id);

    if (!document) {
      this.throwDocumentNotFound();
    }

    const project = await this.getProject(document.projectId);
    assertCanModifyProject(actor, project);

    if (document.storageStatus === DocumentStorageStatus.DELETED) {
      return { message: 'Document deleted successfully.' };
    }

    if (
      document.deletedAt !== null ||
      (document.storageStatus !== DocumentStorageStatus.ACTIVE &&
        document.storageStatus !== DocumentStorageStatus.DELETING)
    ) {
      this.throwDocumentNotFound();
    }

    const resourceType = this.getResourceType(document.cloudinaryResourceType);

    if (document.storageStatus === DocumentStorageStatus.ACTIVE) {
      const started = await this.documents.beginDelete(id);

      if (started.count !== 1) {
        const current = await this.documents.findByIdForReconciliation(id);

        if (current?.storageStatus === DocumentStorageStatus.DELETED) {
          return { message: 'Document deleted successfully.' };
        }

        if (current?.storageStatus !== DocumentStorageStatus.DELETING) {
          throw new ConflictException(
            'Document state changed concurrently. Retry the operation.',
          );
        }
      }
    }

    try {
      await this.cloudinary.deleteAuthenticatedAsset(
        document.cloudinaryPublicId,
        resourceType,
      );
    } catch (error: unknown) {
      this.logFailure(`Cloudinary deletion failed for document ${id}`, error);

      throw new ServiceUnavailableException(
        'Document deletion could not be confirmed. Retry the operation.',
      );
    }

    let finished: { count: number };

    try {
      finished = await this.documents.finishDelete(id);
    } catch (error: unknown) {
      this.logFailure(
        `Cloudinary asset deleted but database finalization failed for ${id}`,
        error,
      );

      throw new ServiceUnavailableException(
        'Document deletion requires metadata reconciliation.',
      );
    }

    if (finished.count !== 1) {
      const current = await this.documents.findByIdForReconciliation(id);

      if (current?.storageStatus !== DocumentStorageStatus.DELETED) {
        throw new ConflictException(
          'Document deletion requires metadata reconciliation.',
        );
      }
    }

    return { message: 'Document deleted successfully.' };
  }

  async createCategory(dto: CreateDocumentCategoryDto, actorId?: string) {
    const actor = await this.resolveActor(actorId);
    this.assertAdmin(actor);

    try {
      return await this.documents.createCategory({
        categoryName: dto.categoryName,
        description: dto.description,
      });
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'A document category with this name already exists.',
        );
      }

      throw error;
    }
  }

  async listCategories(actorId?: string) {
    await this.resolveActor(actorId);

    return this.documents.listCategories();
  }

  async updateCategory(
    id: string,
    dto: UpdateDocumentCategoryDto,
    actorId?: string,
  ) {
    const actor = await this.resolveActor(actorId);
    this.assertAdmin(actor);

    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'At least one category field must be provided.',
      });
    }

    const category = await this.documents.findCategoryById(id);

    if (!category) {
      this.throwCategoryNotFound();
    }

    try {
      return await this.documents.updateCategory(id, {
        categoryName: dto.categoryName,
        description: dto.description,
        isActive: dto.isActive,
      });
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException(
          'A document category with this name already exists.',
        );
      }

      if (this.isPrismaError(error, 'P2025')) {
        this.throwCategoryNotFound();
      }

      throw error;
    }
  }

  async deleteCategory(id: string, actorId?: string) {
    const actor = await this.resolveActor(actorId);
    this.assertAdmin(actor);

    const category = await this.documents.findCategoryById(id);

    if (!category) {
      this.throwCategoryNotFound();
    }

    const referenceCount = await this.documents.countCategoryDocuments(id);

    if (referenceCount > 0) {
      return this.disableReferencedCategory(id);
    }

    try {
      const deleted = await this.documents.deleteUnusedCategory(id);

      if (deleted.count === 1) {
        return {
          message: 'Unused document category deleted successfully.',
          disabled: false,
        };
      }

      const current = await this.documents.findCategoryById(id);

      if (!current) {
        this.throwCategoryNotFound();
      }

      return this.disableReferencedCategory(id);
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2003')) {
        return this.disableReferencedCategory(id);
      }

      throw error;
    }
  }

  private async compensateInvalidUpload(
    id: string,
    publicId: string,
    resourceType: DocumentResourceType,
  ): Promise<void> {
    try {
      await this.cloudinary.deleteAuthenticatedAsset(publicId, resourceType);
    } catch (error: unknown) {
      this.logFailure(
        `Unable to remove inconsistent Cloudinary asset for ${id}`,
        error,
      );

      throw new ServiceUnavailableException(
        'Invalid uploaded asset requires storage reconciliation.',
      );
    }

    try {
      const updated = await this.documents.markUploadFailed(id);

      if (updated.count !== 1) {
        this.logger.error(
          `Document ${id} could not be marked FAILED after compensation`,
        );

        throw new ConflictException('Document status requires reconciliation.');
      }
    } catch (error: unknown) {
      this.logFailure(
        `Unable to finalize failed upload metadata for ${id}`,
        error,
      );

      throw new ServiceUnavailableException(
        'Document upload compensation requires metadata reconciliation.',
      );
    }
  }

  private async disableReferencedCategory(id: string) {
    try {
      await this.documents.disableCategory(id);
    } catch (error: unknown) {
      if (this.isPrismaError(error, 'P2025')) {
        this.throwCategoryNotFound();
      }

      throw error;
    }

    return {
      message: 'Category is referenced by documents and was disabled.',
      disabled: true,
    };
  }

  private async resolveActor(actorId?: string): Promise<ProjectAccessActor> {
    const id = requireProjectActorId(actorId);
    const user = await this.documents.findUserWithRole(id);

    return resolveProjectActor(user);
  }

  private async getProject(projectId: string) {
    const project = await this.documents.findProject(projectId);

    if (!project) {
      throw new NotFoundException({
        code: ErrorCode.PROJECT_NOT_FOUND,
        message: 'Project not found.',
      });
    }

    return project;
  }

  private assertAdmin(actor: ProjectAccessActor): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Only administrators can manage document categories.',
      );
    }
  }

  private getResourceType(value: string): DocumentResourceType {
    if (value === 'image' || value === 'raw') {
      return value;
    }

    throw new ConflictException('Document storage metadata is invalid.');
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === code
    );
  }

  private logFailure(message: string, error: unknown): void {
    this.logger.error(
      message,
      error instanceof Error ? error.stack : String(error),
    );
  }

  private throwDocumentNotFound(): never {
    throw new NotFoundException('Document not found.');
  }

  private throwCategoryNotFound(): never {
    throw new NotFoundException('Document category not found.');
  }
}
