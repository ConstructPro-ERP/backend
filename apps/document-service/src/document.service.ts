import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DocumentStorageStatus,
  ProjectStatus,
  UserStatus,
  type Document,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  CloudinaryService,
  type AuthenticatedUploadResult,
  type DocumentResourceType,
  type SignedDocumentUpload,
} from '../../../libs/common/src/cloudinary/cloudinary.service';
import {
  assertCanModifyProject,
  assertCanReadProject,
  requireProjectActorId,
  resolveProjectActor,
  type ProjectAccessActor,
} from '../../../libs/common/src/project-access/project-access.policy';
import { ErrorCode } from '../../../shared/error-codes';
import { AuthorizeDocumentUploadDto } from './dto/authorize-document-upload.dto';
import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';
import {
  DocumentQueryDto,
  DocumentSortField,
  DocumentSortOrder,
} from './dto/document-query.dto';
import { UpdateDocumentCategoryDto } from './dto/update-document-category.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentRepository } from './repositories/document.repository';
import { verifyStoredDocument } from './validation/stored-document.validator';
import {
  validateDocumentFile,
  validateDocumentUploadMetadata,
  type UploadedDocumentFile,
} from './validation/document-file.validator';

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly documents: DocumentRepository,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async authorizeUpload(
    projectId: string,
    dto: AuthorizeDocumentUploadDto,
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

    const validated = validateDocumentUploadMetadata(dto);

    const category = await this.documents.findActiveCategoryById(
      dto.categoryId,
    );

    if (!category) {
      this.throwCategoryNotFound();
    }

    const id = randomUUID();
    const publicId =
      `constructpro/projects/${projectId}/${id}` +
      (validated.resourceType === 'raw' ? validated.extension : '');

    let signed: SignedDocumentUpload;

    try {
      signed = this.cloudinary.createSignedDocumentUpload(
        publicId,
        validated.resourceType,
      );
    } catch (error: unknown) {
      this.logFailure(
        `Unable to authorize document upload for project ${projectId}`,
        error,
      );

      throw new ServiceUnavailableException(
        'Document upload authorization is temporarily unavailable.',
      );
    }

    await this.documents.createPending({
      id,
      projectId,
      categoryId: dto.categoryId,
      originalName: validated.originalName,
      fileName: validated.originalName,
      mimeType: validated.mimeType,
      fileSize: validated.fileSize,
      cloudinaryPublicId: publicId,
      cloudinaryResourceType: validated.resourceType,
      uploadedById: actor.id,
      description: dto.description ?? null,
    });

    return {
      documentId: id,
      ...signed,
    };
  }

  async completeUpload(
    projectId: string,
    documentId: string,
    actorId?: string,
  ) {
    const actor = await this.resolveActor(actorId);

    const document = await this.documents.findByIdForReconciliation(documentId);

    if (
      !document ||
      document.projectId !== projectId ||
      document.deletedAt !== null
    ) {
      this.throwDocumentNotFound();
    }

    const project = await this.getProject(projectId);

    assertCanModifyProject(actor, project);

    if (document.uploadedById !== actor.id) {
      throw new ForbiddenException(
        'Only the original uploader can complete this upload.',
      );
    }

    if (document.storageStatus === DocumentStorageStatus.ACTIVE) {
      return this.findOne(documentId, actor.id);
    }

    if (document.storageStatus !== DocumentStorageStatus.PENDING) {
      throw new ConflictException(
        'Document is not awaiting upload completion.',
      );
    }

    if (
      project.status === ProjectStatus.COMPLETED ||
      project.status === ProjectStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Documents cannot be completed for completed or cancelled projects.',
      );
    }

    let verification: Awaited<ReturnType<typeof verifyStoredDocument>>;

    try {
      verification = await verifyStoredDocument(this.cloudinary, document);
    } catch (error: unknown) {
      this.logFailure(`Document ${documentId} verification failed`, error);

      throw new ServiceUnavailableException(
        'Document verification is temporarily unavailable.',
      );
    }

    if (verification === 'missing') {
      throw new ConflictException(
        'Document upload has not completed in Cloudinary.',
      );
    }

    if (verification === 'invalid') {
      await this.compensateInvalidUpload(
        documentId,
        document.cloudinaryPublicId,
        this.getResourceType(document.cloudinaryResourceType),
      );

      throw new BadRequestException({
        code: ErrorCode.DOCUMENT_INVALID_FILE,
        message: 'Uploaded document failed content verification.',
      });
    }

    const activated = await this.documents.markUploadActive(documentId);

    if (activated.count !== 1) {
      const current =
        await this.documents.findByIdForReconciliation(documentId);

      if (current?.storageStatus !== DocumentStorageStatus.ACTIVE) {
        throw new ConflictException(
          'Document state changed during upload completion.',
        );
      }
    }

    return this.findOne(documentId, actor.id);
  }

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
    const projectActor = await this.resolveDocumentReader(actorId);
    const project = await this.getProject(projectId);

    if (projectActor) {
      assertCanReadProject(projectActor, project);
    }

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
    const projectActor = await this.resolveDocumentReader(actorId);
    const document = await this.documents.findActiveById(id);

    if (!document) {
      this.throwDocumentNotFound();
    }

    const project = await this.getProject(document.projectId);

    if (projectActor) {
      assertCanReadProject(projectActor, project);
    }

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
    const projectActor = await this.resolveDocumentReader(actorId);
    const document = await this.documents.findActiveById(id);

    if (!document) {
      this.throwDocumentNotFound();
    }

    const project = await this.getProject(document.projectId);

    if (projectActor) {
      assertCanReadProject(projectActor, project);
    }

    return this.createSignedDownload(document, id);
  }

  async downloadForClient(id: string, actorId?: string) {
    const userId = requireProjectActorId(actorId);
    const user = await this.documents.findClientPortalUser(userId);

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Authenticated user was not found.',
      });
    }

    if (
      user.status !== UserStatus.ACTIVE ||
      user.role?.roleName !== 'CLIENT_PORTAL_USER'
    ) {
      throw new ForbiddenException({
        code: ErrorCode.CLIENT_PORTAL_ACCESS_DENIED,
        message: 'Client portal access is not permitted.',
      });
    }

    if (!user.customer) {
      throw new ForbiddenException({
        code: ErrorCode.CLIENT_PROFILE_NOT_LINKED,
        message: 'No customer profile is linked to this account.',
      });
    }

    const document = await this.documents.findActiveForClient(
      id,
      user.customer.id,
    );

    if (!document) {
      this.throwDocumentNotFound();
    }

    return this.createSignedDownload(document, id);
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
    await this.resolveDocumentReader(actorId);

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
      const updated = await this.documents.markUploadFailed(id);

      if (updated.count !== 1) {
        throw new ConflictException(
          'Document status changed during upload compensation.',
        );
      }
    } catch (error: unknown) {
      this.logFailure(`Failed to transition document ${id} to FAILED`, error);

      throw new ServiceUnavailableException(
        'Document upload requires metadata reconciliation.',
      );
    }

    try {
      await this.cloudinary.deleteAuthenticatedAsset(publicId, resourceType);
    } catch (error: unknown) {
      this.logFailure(`Failed to remove invalid Cloudinary asset ${id}`, error);

      throw new ServiceUnavailableException(
        'Document upload requires storage cleanup.',
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

  private async resolveDocumentReader(actorId?: string) {
    const userId = requireProjectActorId(actorId);
    const user = await this.documents.findUserWithRole(userId);

    // Sales Managers can read documents without gaining
    // general Project Service permissions.
    if (
      user?.status === UserStatus.ACTIVE &&
      user.role?.roleName === 'SALES_MANAGER'
    ) {
      return null;
    }

    // All other roles use the existing project authorization policy.
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

  private createSignedDownload(
    document: Pick<
      Document,
      'originalName' | 'cloudinaryPublicId' | 'cloudinaryResourceType'
    >,
    id: string,
  ) {
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
