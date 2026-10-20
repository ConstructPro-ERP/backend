import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DocumentStorageStatus,
  ProjectStatus,
  UserStatus,
} from '@prisma/client';
import { DocumentService } from '../../apps/document-service/src/document.service';
import {
  DocumentRepository,
  type CreatePendingDocumentData,
} from '../../apps/document-service/src/repositories/document.repository';
import {
  CloudinaryService,
  type DocumentResourceType,
} from '../../libs/common/src/cloudinary/cloudinary.service';

const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

const file = {
  originalname: 'contract.pdf',
  mimetype: 'application/pdf',
  size: pdf.length,
  buffer: pdf,
};

const timestamp = new Date('2026-10-11T00:00:00.000Z');

const document = {
  id: 'doc-1',
  projectId: 'project-1',
  categoryId: 'category-1',
  originalName: 'contract.pdf',
  fileName: 'contract.pdf',
  mimeType: 'application/pdf',
  fileSize: pdf.length,
  description: null,
  uploadedById: 'admin-1',
  createdAt: timestamp,
  updatedAt: timestamp,
  cloudinaryPublicId: 'constructpro/projects/project-1/doc-1.pdf',
  cloudinaryResourceType: 'raw',
  storageStatus: DocumentStorageStatus.ACTIVE,
  deletedAt: null,
};

const mockDocuments = {
  findUserWithRole: jest.fn(),
  findProject: jest.fn(),
  findActiveCategoryById: jest.fn(),
  createPending: jest.fn(),
  markUploadActive: jest.fn(),
  markUploadFailed: jest.fn(),
  findActiveById: jest.fn(),
  findClientPortalUser: jest.fn(),
  findActiveForClient: jest.fn(),
  findByIdForReconciliation: jest.fn(),
  findManyAndCount: jest.fn(),
  beginDelete: jest.fn(),
  finishDelete: jest.fn(),
  findCategoryById: jest.fn(),
  createCategory: jest.fn(),
  listCategories: jest.fn(),
  updateCategory: jest.fn(),
  countCategoryDocuments: jest.fn(),
  disableCategory: jest.fn(),
  deleteUnusedCategory: jest.fn(),
};

const mockCloudinary = {
  createSignedDocumentUpload: jest.fn(),
  uploadAuthenticatedBuffer: jest.fn(),
  deleteAuthenticatedAsset: jest.fn(),
  createAuthenticatedDownloadUrl: jest.fn(),
};

function makeUser(roleName: string, id = 'admin-1') {
  return {
    id,
    status: UserStatus.ACTIVE,
    role: { roleName },
  };
}

describe('DocumentService', () => {
  let service: DocumentService;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    service = new DocumentService(
      mockDocuments as unknown as DocumentRepository,
      mockCloudinary as unknown as CloudinaryService,
    );

    mockDocuments.findUserWithRole.mockResolvedValue(makeUser('ADMIN'));

    mockDocuments.findProject.mockResolvedValue({
      id: 'project-1',
      projectManagerId: 'manager-1',
      status: ProjectStatus.ACTIVE,
    });

    mockDocuments.findActiveCategoryById.mockResolvedValue({
      id: 'category-1',
      isActive: true,
    });

    mockDocuments.createPending.mockResolvedValue({});
    mockDocuments.markUploadActive.mockResolvedValue({ count: 1 });
    mockDocuments.markUploadFailed.mockResolvedValue({ count: 1 });

    mockDocuments.findActiveById.mockResolvedValue(document);
    mockDocuments.findByIdForReconciliation.mockResolvedValue(document);
    mockDocuments.findManyAndCount.mockResolvedValue([[], 0]);

    mockDocuments.beginDelete.mockResolvedValue({ count: 1 });
    mockDocuments.finishDelete.mockResolvedValue({ count: 1 });

    mockDocuments.findCategoryById.mockResolvedValue({
      id: 'category-1',
      categoryName: 'Contracts',
      isActive: true,
    });

    mockDocuments.createCategory.mockResolvedValue({
      id: 'category-1',
      categoryName: 'Contracts',
    });

    mockDocuments.listCategories.mockResolvedValue([
      { id: 'category-1', categoryName: 'Contracts' },
    ]);

    mockDocuments.updateCategory.mockResolvedValue({
      id: 'category-1',
    });

    mockDocuments.countCategoryDocuments.mockResolvedValue(0);
    mockDocuments.disableCategory.mockResolvedValue({});
    mockDocuments.deleteUnusedCategory.mockResolvedValue({ count: 1 });

    mockCloudinary.createSignedDocumentUpload.mockImplementation(
      (publicId: string, resourceType: DocumentResourceType) => ({
        cloudName: 'test-cloud',
        apiKey: 'test-key',
        publicId,
        resourceType,
        timestamp: 1790000000,
        signature: 'test-signature',
        uploadParameters: {
          public_id: publicId,
          timestamp: 1790000000,
          type: 'authenticated',
          overwrite: 'false',
        },
      }),
    );

    mockCloudinary.uploadAuthenticatedBuffer.mockImplementation(
      (buffer: Buffer, publicId: string, resourceType: DocumentResourceType) =>
        Promise.resolve({
          publicId,
          resourceType,
          bytes: buffer.length,
        }),
    );

    mockCloudinary.deleteAuthenticatedAsset.mockResolvedValue(undefined);

    mockCloudinary.createAuthenticatedDownloadUrl.mockReturnValue(
      'https://cloudinary.example/signed-document',
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('authentication and authorization', () => {
    it('rejects missing authentication', async () => {
      await expect(service.findAll('project-1', {})).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockDocuments.findManyAndCount).not.toHaveBeenCalled();
    });

    it('rejects unknown actors', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue(null);

      await expect(service.findOne('doc-1', 'unknown-user')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects inactive users', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue({
        ...makeUser('ADMIN'),
        status: UserStatus.INACTIVE,
      });

      await expect(service.findOne('doc-1', 'admin-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects client downloads without verified ownership', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue(
        makeUser('CLIENT_PORTAL_USER', 'client-1'),
      );

      await expect(service.download('doc-1', 'client-1')).rejects.toThrow(
        ForbiddenException,
      );

      expect(
        mockCloudinary.createAuthenticatedDownloadUrl,
      ).not.toHaveBeenCalled();
    });

    it('rejects unassigned project managers', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue(
        makeUser('PROJECT_MANAGER', 'manager-2'),
      );

      await expect(service.download('doc-1', 'manager-2')).rejects.toThrow(
        ForbiddenException,
      );

      expect(
        mockCloudinary.createAuthenticatedDownloadUrl,
      ).not.toHaveBeenCalled();
    });

    it('allows assigned project managers to read documents', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue(
        makeUser('PROJECT_MANAGER', 'manager-1'),
      );

      const result = await service.findOne('doc-1', 'manager-1');

      expect(result.id).toBe('doc-1');
    });

    it('allows accountants to read but not upload', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue(
        makeUser('ACCOUNTANT', 'accountant-1'),
      );

      await expect(
        service.findOne('doc-1', 'accountant-1'),
      ).resolves.toHaveProperty('id', 'doc-1');

      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          file,
          'accountant-1',
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockCloudinary.uploadAuthenticatedBuffer).not.toHaveBeenCalled();
    });

    it('allows active sales managers to read documents', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue(
        makeUser('SALES_MANAGER', 'sales-1'),
      );

      await expect(
        service.findAll('project-1', {}, 'sales-1'),
      ).resolves.toHaveProperty('meta.total', 0);

      await expect(service.findOne('doc-1', 'sales-1')).resolves.toHaveProperty(
        'id',
        'doc-1',
      );

      await expect(service.download('doc-1', 'sales-1')).resolves.toEqual({
        downloadUrl: 'https://cloudinary.example/signed-document',
        expiresInSeconds: 300,
      });

      await expect(service.listCategories('sales-1')).resolves.toEqual([
        { id: 'category-1', categoryName: 'Contracts' },
      ]);
    });

    it('prevents sales managers from modifying documents and categories', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue(
        makeUser('SALES_MANAGER', 'sales-1'),
      );

      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          file,
          'sales-1',
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(service.remove('doc-1', 'sales-1')).rejects.toThrow(
        ForbiddenException,
      );

      await expect(
        service.createCategory({ categoryName: 'Drawings' }, 'sales-1'),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.updateCategory('category-1', { isActive: false }, 'sales-1'),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.deleteCategory('category-1', 'sales-1'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockDocuments.createPending).not.toHaveBeenCalled();
      expect(mockDocuments.beginDelete).not.toHaveBeenCalled();
      expect(mockDocuments.createCategory).not.toHaveBeenCalled();
      expect(mockDocuments.updateCategory).not.toHaveBeenCalled();
      expect(mockDocuments.deleteUnusedCategory).not.toHaveBeenCalled();
    });

    it('rejects inactive sales managers', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue({
        ...makeUser('SALES_MANAGER', 'sales-1'),
        status: UserStatus.INACTIVE,
      });

      await expect(service.findOne('doc-1', 'sales-1')).rejects.toThrow(
        ForbiddenException,
      );

      expect(mockDocuments.findActiveById).not.toHaveBeenCalled();
    });

    it('prevents accountants from deleting documents', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue(
        makeUser('ACCOUNTANT', 'accountant-1'),
      );

      await expect(service.remove('doc-1', 'accountant-1')).rejects.toThrow(
        ForbiddenException,
      );

      expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
    });

    it('rejects nonexistent projects', async () => {
      mockDocuments.findProject.mockResolvedValue(null);

      await expect(service.findAll('project-1', {}, 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('direct upload authorization', () => {
    const authorization = {
      categoryId: 'category-1',
      fileName: 'contract.pdf',
      mimeType: 'application/pdf',
      fileSize: 10 * 1024 * 1024,
      description: 'Approved contract',
    };

    it('creates a pending document and returns signed upload credentials', async () => {
      const result = await service.authorizeUpload(
        'project-1',
        authorization,
        'admin-1',
      );

      const createPendingCalls = mockDocuments.createPending.mock
        .calls as unknown as Array<[CreatePendingDocumentData]>;

      const created = createPendingCalls[0]?.[0];

      expect(created).toBeDefined();

      if (!created) {
        throw new Error('Expected pending document metadata.');
      }

      expect(created).toMatchObject({
        projectId: 'project-1',
        categoryId: 'category-1',
        originalName: 'contract.pdf',
        fileName: 'contract.pdf',
        mimeType: 'application/pdf',
        fileSize: authorization.fileSize,
        cloudinaryResourceType: 'raw',
        uploadedById: 'admin-1',
        description: 'Approved contract',
      });

      expect(created.cloudinaryPublicId).toBe(
        `constructpro/projects/project-1/${created.id}.pdf`,
      );

      expect(mockCloudinary.createSignedDocumentUpload).toHaveBeenCalledWith(
        created.cloudinaryPublicId,
        'raw',
      );

      expect(result).toMatchObject({
        documentId: created.id,
        publicId: created.cloudinaryPublicId,
        signature: 'test-signature',
        uploadParameters: {
          type: 'authenticated',
          overwrite: 'false',
        },
      });

      expect(result).not.toHaveProperty('apiSecret');
      expect(mockDocuments.markUploadActive).not.toHaveBeenCalled();
      expect(mockCloudinary.uploadAuthenticatedBuffer).not.toHaveBeenCalled();
    });

    it('allows an assigned project manager to authorize uploads', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue(
        makeUser('PROJECT_MANAGER', 'manager-1'),
      );

      await expect(
        service.authorizeUpload('project-1', authorization, 'manager-1'),
      ).resolves.toHaveProperty('signature', 'test-signature');

      expect(mockDocuments.createPending).toHaveBeenCalledWith(
        expect.objectContaining({ uploadedById: 'manager-1' }),
      );
    });

    it('rejects unauthorized document upload requests', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue(
        makeUser('ACCOUNTANT', 'accountant-1'),
      );

      await expect(
        service.authorizeUpload('project-1', authorization, 'accountant-1'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockDocuments.createPending).not.toHaveBeenCalled();
      expect(mockCloudinary.createSignedDocumentUpload).not.toHaveBeenCalled();
    });

    it('rejects unassigned project managers', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue(
        makeUser('PROJECT_MANAGER', 'manager-2'),
      );

      await expect(
        service.authorizeUpload('project-1', authorization, 'manager-2'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockDocuments.createPending).not.toHaveBeenCalled();
    });

    it.each([ProjectStatus.COMPLETED, ProjectStatus.CANCELLED])(
      'rejects authorization for %s projects',
      async (status) => {
        mockDocuments.findProject.mockResolvedValue({
          id: 'project-1',
          projectManagerId: 'manager-1',
          status,
        });

        await expect(
          service.authorizeUpload('project-1', authorization, 'admin-1'),
        ).rejects.toThrow(ConflictException);

        expect(mockDocuments.createPending).not.toHaveBeenCalled();
      },
    );

    it('rejects inactive document categories', async () => {
      mockDocuments.findActiveCategoryById.mockResolvedValue(null);

      await expect(
        service.authorizeUpload('project-1', authorization, 'admin-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockDocuments.createPending).not.toHaveBeenCalled();
    });

    it('rejects unsupported file metadata', async () => {
      await expect(
        service.authorizeUpload(
          'project-1',
          {
            ...authorization,
            fileName: 'malware.exe',
            mimeType: 'application/octet-stream',
          },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockDocuments.createPending).not.toHaveBeenCalled();
    });

    it('rejects oversized files before signing', async () => {
      await expect(
        service.authorizeUpload(
          'project-1',
          {
            ...authorization,
            fileSize: 50 * 1024 * 1024 + 1,
          },
          'admin-1',
        ),
      ).rejects.toThrow();

      expect(mockCloudinary.createSignedDocumentUpload).not.toHaveBeenCalled();
      expect(mockDocuments.createPending).not.toHaveBeenCalled();
    });

    it('does not create metadata when signing fails', async () => {
      mockCloudinary.createSignedDocumentUpload.mockImplementation(() => {
        throw new Error('Cloudinary configuration unavailable');
      });

      await expect(
        service.authorizeUpload('project-1', authorization, 'admin-1'),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mockDocuments.createPending).not.toHaveBeenCalled();
    });

    it('does not return authorization when creating metadata fails', async () => {
      mockDocuments.createPending.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(
        service.authorizeUpload('project-1', authorization, 'admin-1'),
      ).rejects.toThrow('Database unavailable');
    });
  });

  describe('document uploads', () => {
    it('creates metadata, uploads and activates a document', async () => {
      const result = await service.upload(
        'project-1',
        { categoryId: 'category-1' },
        file,
        'admin-1',
      );

      const calls = mockDocuments.createPending.mock.calls as unknown as Array<
        [CreatePendingDocumentData]
      >;

      const reservation = calls[0]?.[0];

      expect(reservation).toBeDefined();

      if (!reservation) {
        throw new Error('Expected a document reservation.');
      }

      expect(reservation.projectId).toBe('project-1');
      expect(reservation.categoryId).toBe('category-1');
      expect(reservation.originalName).toBe('contract.pdf');
      expect(reservation.fileSize).toBe(pdf.length);
      expect(reservation.cloudinaryResourceType).toBe('raw');
      expect(reservation.uploadedById).toBe('admin-1');

      expect(reservation.cloudinaryPublicId).toMatch(
        /^constructpro\/projects\/project-1\/[0-9a-f-]+\.pdf$/,
      );

      expect(mockCloudinary.uploadAuthenticatedBuffer).toHaveBeenCalledWith(
        pdf,
        reservation.cloudinaryPublicId,
        'raw',
      );

      expect(mockDocuments.markUploadActive).toHaveBeenCalledWith(
        reservation.id,
      );

      expect(result).not.toHaveProperty('cloudinaryPublicId');
      expect(result).not.toHaveProperty('fileUrl');
    });

    it('rejects missing files before database writes', async () => {
      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          undefined,
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockDocuments.createPending).not.toHaveBeenCalled();
    });

    it('rejects executable file uploads', async () => {
      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          { ...file, originalname: 'malware.exe' },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockDocuments.createPending).not.toHaveBeenCalled();
    });

    it('rejects inactive categories', async () => {
      mockDocuments.findActiveCategoryById.mockResolvedValue(null);

      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          file,
          'admin-1',
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockDocuments.createPending).not.toHaveBeenCalled();
    });

    it.each([ProjectStatus.COMPLETED, ProjectStatus.CANCELLED])(
      'rejects uploads for %s projects',
      async (status) => {
        mockDocuments.findProject.mockResolvedValue({
          id: 'project-1',
          projectManagerId: 'manager-1',
          status,
        });

        await expect(
          service.upload(
            'project-1',
            { categoryId: 'category-1' },
            file,
            'admin-1',
          ),
        ).rejects.toThrow(ConflictException);

        expect(mockDocuments.createPending).not.toHaveBeenCalled();
      },
    );

    it('does not upload if the database reservation fails', async () => {
      mockDocuments.createPending.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          file,
          'admin-1',
        ),
      ).rejects.toThrow('Database unavailable');

      expect(mockCloudinary.uploadAuthenticatedBuffer).not.toHaveBeenCalled();
    });

    it('preserves PENDING metadata after uncertain upload failure', async () => {
      mockCloudinary.uploadAuthenticatedBuffer.mockRejectedValue(
        new Error('Upload response lost'),
      );

      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          file,
          'admin-1',
        ),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mockDocuments.markUploadFailed).not.toHaveBeenCalled();
      expect(mockDocuments.markUploadActive).not.toHaveBeenCalled();
      expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
    });

    it('compensates when Cloudinary returns the wrong file size', async () => {
      mockCloudinary.uploadAuthenticatedBuffer.mockImplementation(
        (
          buffer: Buffer,
          publicId: string,
          resourceType: DocumentResourceType,
        ) =>
          Promise.resolve({
            publicId,
            resourceType,
            bytes: buffer.length + 1,
          }),
      );

      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          file,
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);

      expect(mockCloudinary.deleteAuthenticatedAsset).toHaveBeenCalledTimes(1);

      expect(mockDocuments.markUploadFailed).toHaveBeenCalledTimes(1);
      expect(mockDocuments.markUploadActive).not.toHaveBeenCalled();
    });

    it('preserves metadata when compensation deletion fails', async () => {
      mockCloudinary.uploadAuthenticatedBuffer.mockImplementation(
        (
          buffer: Buffer,
          publicId: string,
          resourceType: DocumentResourceType,
        ) =>
          Promise.resolve({
            publicId,
            resourceType,
            bytes: buffer.length + 1,
          }),
      );

      mockCloudinary.deleteAuthenticatedAsset.mockRejectedValue(
        new Error('Cloudinary unavailable'),
      );

      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          file,
          'admin-1',
        ),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mockDocuments.markUploadFailed).toHaveBeenCalledTimes(1);
    });

    it('reports failure when compensation metadata cannot be finalized', async () => {
      mockCloudinary.uploadAuthenticatedBuffer.mockImplementation(
        (
          buffer: Buffer,
          publicId: string,
          resourceType: DocumentResourceType,
        ) =>
          Promise.resolve({
            publicId,
            resourceType,
            bytes: buffer.length + 1,
          }),
      );

      mockDocuments.markUploadFailed.mockRejectedValue(
        new Error('Database timeout'),
      );

      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          file,
          'admin-1',
        ),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('preserves storage when upload compensation loses a concurrent update', async () => {
      mockCloudinary.uploadAuthenticatedBuffer.mockImplementationOnce(
        (
          buffer: Buffer,
          publicId: string,
          resourceType: DocumentResourceType,
        ) =>
          Promise.resolve({
            publicId,
            resourceType,
            bytes: buffer.length + 1,
          }),
      );

      mockDocuments.markUploadFailed.mockResolvedValue({ count: 0 });

      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          file,
          'admin-1',
        ),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mockDocuments.markUploadFailed).toHaveBeenCalledTimes(1);
      expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
    });

    it('preserves Cloudinary bytes after activation failure', async () => {
      mockDocuments.markUploadActive.mockRejectedValue(
        new Error('Database response lost'),
      );

      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          file,
          'admin-1',
        ),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
    });

    it('reports conditional activation conflicts', async () => {
      mockDocuments.markUploadActive.mockResolvedValue({ count: 0 });

      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          file,
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);

      expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
    });

    it('does not delete an ACTIVE asset if the final read fails', async () => {
      mockDocuments.findActiveById.mockRejectedValue(
        new Error('Document read failed'),
      );

      await expect(
        service.upload(
          'project-1',
          { categoryId: 'category-1' },
          file,
          'admin-1',
        ),
      ).rejects.toThrow('Document read failed');

      expect(mockDocuments.markUploadActive).toHaveBeenCalledTimes(1);
      expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
    });
  });

  describe('document retrieval and download', () => {
    it('uses project-scoped pagination and filters', async () => {
      await service.findAll(
        'project-1',
        {
          page: 2,
          limit: 10,
          categoryId: 'category-1',
          search: 'contract',
        },
        'admin-1',
      );

      expect(mockDocuments.findManyAndCount).toHaveBeenCalledWith({
        projectId: 'project-1',
        categoryId: 'category-1',
        search: 'contract',
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
    });

    it('returns paginated metadata', async () => {
      mockDocuments.findManyAndCount.mockResolvedValue([[{ id: 'doc-1' }], 21]);

      await expect(
        service.findAll('project-1', { page: 2, limit: 10 }, 'admin-1'),
      ).resolves.toEqual({
        data: [{ id: 'doc-1' }],
        meta: {
          page: 2,
          limit: 10,
          total: 21,
          totalPages: 3,
        },
      });
    });

    it('returns 404 for nonexistent documents', async () => {
      mockDocuments.findActiveById.mockResolvedValue(null);

      await expect(
        service.findOne('missing-document', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects downloads for nonexistent documents', async () => {
      mockDocuments.findActiveById.mockResolvedValue(null);

      await expect(
        service.download('missing-document', 'admin-1'),
      ).rejects.toThrow(NotFoundException);

      expect(
        mockCloudinary.createAuthenticatedDownloadUrl,
      ).not.toHaveBeenCalled();
    });

    it('does not expose Cloudinary identifiers in document details', async () => {
      const result = await service.findOne('doc-1', 'admin-1');

      expect(result.id).toBe('doc-1');
      expect(result).not.toHaveProperty('cloudinaryPublicId');
      expect(result).not.toHaveProperty('cloudinaryResourceType');
      expect(result).not.toHaveProperty('fileUrl');
      expect(result).not.toHaveProperty('storageStatus');
    });

    it('generates a signed download URL after authorization', async () => {
      await expect(service.download('doc-1', 'admin-1')).resolves.toEqual({
        downloadUrl: 'https://cloudinary.example/signed-document',
        expiresInSeconds: 300,
      });

      expect(
        mockCloudinary.createAuthenticatedDownloadUrl,
      ).toHaveBeenCalledWith(document.cloudinaryPublicId, 'pdf', 'raw');
    });

    it('rejects invalid storage resource types', async () => {
      mockDocuments.findActiveById.mockResolvedValue({
        ...document,
        cloudinaryResourceType: 'video',
      });

      await expect(service.download('doc-1', 'admin-1')).rejects.toThrow(
        ConflictException,
      );

      expect(
        mockCloudinary.createAuthenticatedDownloadUrl,
      ).not.toHaveBeenCalled();
    });

    it('reports Cloudinary download failures', async () => {
      mockCloudinary.createAuthenticatedDownloadUrl.mockImplementation(() => {
        throw new Error('Cloudinary not configured');
      });

      await expect(service.download('doc-1', 'admin-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('client portal document downloads', () => {
    beforeEach(() => {
      mockDocuments.findClientPortalUser.mockResolvedValue({
        id: 'client-1',
        status: UserStatus.ACTIVE,
        role: { roleName: 'CLIENT_PORTAL_USER' },
        customer: { id: 'customer-1' },
      });

      mockDocuments.findActiveForClient.mockResolvedValue(document);
    });

    it('rejects missing authentication', async () => {
      await expect(service.downloadForClient('doc-1')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockDocuments.findActiveForClient).not.toHaveBeenCalled();
    });

    it('rejects unknown users', async () => {
      mockDocuments.findClientPortalUser.mockResolvedValue(null);

      await expect(
        service.downloadForClient('doc-1', 'unknown-user'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockDocuments.findActiveForClient).not.toHaveBeenCalled();
    });

    it('rejects inactive clients', async () => {
      mockDocuments.findClientPortalUser.mockResolvedValue({
        id: 'client-1',
        status: UserStatus.INACTIVE,
        role: { roleName: 'CLIENT_PORTAL_USER' },
        customer: { id: 'customer-1' },
      });

      await expect(
        service.downloadForClient('doc-1', 'client-1'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockDocuments.findActiveForClient).not.toHaveBeenCalled();
    });

    it('rejects non-client roles', async () => {
      mockDocuments.findClientPortalUser.mockResolvedValue({
        id: 'admin-1',
        status: UserStatus.ACTIVE,
        role: { roleName: 'ADMIN' },
        customer: { id: 'customer-1' },
      });

      await expect(
        service.downloadForClient('doc-1', 'admin-1'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockDocuments.findActiveForClient).not.toHaveBeenCalled();
    });

    it('rejects clients without a linked customer', async () => {
      mockDocuments.findClientPortalUser.mockResolvedValue({
        id: 'client-1',
        status: UserStatus.ACTIVE,
        role: { roleName: 'CLIENT_PORTAL_USER' },
        customer: null,
      });

      await expect(
        service.downloadForClient('doc-1', 'client-1'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockDocuments.findActiveForClient).not.toHaveBeenCalled();
    });

    it('hides documents that are not authorized', async () => {
      mockDocuments.findActiveForClient.mockResolvedValue(null);

      await expect(
        service.downloadForClient('foreign-doc', 'client-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockDocuments.findActiveForClient).toHaveBeenCalledWith(
        'foreign-doc',
        'customer-1',
      );

      expect(
        mockCloudinary.createAuthenticatedDownloadUrl,
      ).not.toHaveBeenCalled();
    });

    it('generates a signed URL for an owned document', async () => {
      const result = await service.downloadForClient('doc-1', 'client-1');

      expect(result).toEqual({
        downloadUrl: 'https://cloudinary.example/signed-document',
        expiresInSeconds: 300,
      });

      expect(mockDocuments.findActiveForClient).toHaveBeenCalledWith(
        'doc-1',
        'customer-1',
      );

      expect(
        mockCloudinary.createAuthenticatedDownloadUrl,
      ).toHaveBeenCalledWith(document.cloudinaryPublicId, 'pdf', 'raw');
    });

    it('handles Cloudinary signing errors', async () => {
      mockCloudinary.createAuthenticatedDownloadUrl.mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      await expect(
        service.downloadForClient('doc-1', 'client-1'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('document deletion', () => {
    it('rejects deletion of nonexistent documents', async () => {
      mockDocuments.findByIdForReconciliation.mockResolvedValue(null);

      await expect(
        service.remove('missing-document', 'admin-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockDocuments.beginDelete).not.toHaveBeenCalled();
      expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
    });

    it('transitions ACTIVE to DELETING and DELETED', async () => {
      await expect(service.remove('doc-1', 'admin-1')).resolves.toEqual({
        message: 'Document deleted successfully.',
      });

      expect(mockDocuments.beginDelete).toHaveBeenCalledWith('doc-1');

      expect(mockCloudinary.deleteAuthenticatedAsset).toHaveBeenCalledWith(
        document.cloudinaryPublicId,
        'raw',
      );

      expect(mockDocuments.finishDelete).toHaveBeenCalledWith('doc-1');
    });

    it('retains DELETING when Cloudinary deletion fails', async () => {
      mockCloudinary.deleteAuthenticatedAsset.mockRejectedValue(
        new Error('Storage unavailable'),
      );

      await expect(service.remove('doc-1', 'admin-1')).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(mockDocuments.beginDelete).toHaveBeenCalledTimes(1);
      expect(mockDocuments.finishDelete).not.toHaveBeenCalled();
    });

    it('retries deletion of DELETING documents', async () => {
      mockDocuments.findByIdForReconciliation.mockResolvedValue({
        ...document,
        storageStatus: DocumentStorageStatus.DELETING,
      });

      await expect(service.remove('doc-1', 'admin-1')).resolves.toHaveProperty(
        'message',
        'Document deleted successfully.',
      );

      expect(mockDocuments.beginDelete).not.toHaveBeenCalled();

      expect(mockCloudinary.deleteAuthenticatedAsset).toHaveBeenCalledTimes(1);

      expect(mockDocuments.finishDelete).toHaveBeenCalledTimes(1);
    });

    it('handles already-deleted documents idempotently', async () => {
      mockDocuments.findByIdForReconciliation.mockResolvedValue({
        ...document,
        storageStatus: DocumentStorageStatus.DELETED,
        deletedAt: timestamp,
      });

      await expect(service.remove('doc-1', 'admin-1')).resolves.toHaveProperty(
        'message',
        'Document deleted successfully.',
      );

      expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
    });

    it('rejects deletion of pending uploads', async () => {
      mockDocuments.findByIdForReconciliation.mockResolvedValue({
        ...document,
        storageStatus: DocumentStorageStatus.PENDING,
      });

      await expect(service.remove('doc-1', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
    });

    it('rejects invalid storage resource types before deletion', async () => {
      mockDocuments.findByIdForReconciliation.mockResolvedValue({
        ...document,
        cloudinaryResourceType: 'video',
      });

      await expect(service.remove('doc-1', 'admin-1')).rejects.toThrow(
        ConflictException,
      );

      expect(mockDocuments.beginDelete).not.toHaveBeenCalled();
    });

    it('reports concurrent deletion changes', async () => {
      mockDocuments.beginDelete.mockResolvedValue({ count: 0 });

      await expect(service.remove('doc-1', 'admin-1')).rejects.toThrow(
        ConflictException,
      );

      expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
    });

    it('continues if another request already started deletion', async () => {
      mockDocuments.beginDelete.mockResolvedValue({ count: 0 });

      mockDocuments.findByIdForReconciliation
        .mockResolvedValueOnce(document)
        .mockResolvedValueOnce({
          ...document,
          storageStatus: DocumentStorageStatus.DELETING,
        });

      await expect(service.remove('doc-1', 'admin-1')).resolves.toHaveProperty(
        'message',
        'Document deleted successfully.',
      );
    });

    it('accepts deletion completed concurrently before storage removal', async () => {
      mockDocuments.beginDelete.mockResolvedValue({ count: 0 });

      mockDocuments.findByIdForReconciliation
        .mockResolvedValueOnce(document)
        .mockResolvedValueOnce({
          ...document,
          storageStatus: DocumentStorageStatus.DELETED,
          deletedAt: timestamp,
        });

      await expect(service.remove('doc-1', 'admin-1')).resolves.toEqual({
        message: 'Document deleted successfully.',
      });

      expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
    });

    it('reports unresolved metadata after successful storage deletion', async () => {
      mockDocuments.finishDelete.mockResolvedValue({ count: 0 });

      await expect(service.remove('doc-1', 'admin-1')).rejects.toThrow(
        ConflictException,
      );

      expect(mockCloudinary.deleteAuthenticatedAsset).toHaveBeenCalledTimes(1);
      expect(mockDocuments.finishDelete).toHaveBeenCalledWith('doc-1');
    });

    it('preserves DELETING after metadata finalization fails', async () => {
      mockDocuments.finishDelete.mockRejectedValue(
        new Error('Database timeout'),
      );

      await expect(service.remove('doc-1', 'admin-1')).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(mockCloudinary.deleteAuthenticatedAsset).toHaveBeenCalledTimes(1);
    });

    it('accepts an already-finalized concurrent deletion', async () => {
      mockDocuments.finishDelete.mockResolvedValue({ count: 0 });

      mockDocuments.findByIdForReconciliation
        .mockResolvedValueOnce(document)
        .mockResolvedValueOnce({
          ...document,
          storageStatus: DocumentStorageStatus.DELETED,
          deletedAt: timestamp,
        });

      await expect(service.remove('doc-1', 'admin-1')).resolves.toHaveProperty(
        'message',
        'Document deleted successfully.',
      );
    });
  });

  describe('document category management', () => {
    it('allows administrators to create categories', async () => {
      await expect(
        service.createCategory({ categoryName: 'Contracts' }, 'admin-1'),
      ).resolves.toHaveProperty('id', 'category-1');

      expect(mockDocuments.createCategory).toHaveBeenCalledWith({
        categoryName: 'Contracts',
        description: undefined,
      });
    });

    it('denies category management to accountants', async () => {
      mockDocuments.findUserWithRole.mockResolvedValue(
        makeUser('ACCOUNTANT', 'accountant-1'),
      );

      await expect(
        service.createCategory({ categoryName: 'Contracts' }, 'accountant-1'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockDocuments.createCategory).not.toHaveBeenCalled();
    });

    it('handles duplicate category names', async () => {
      mockDocuments.createCategory.mockRejectedValue({
        code: 'P2002',
      });

      await expect(
        service.createCategory({ categoryName: 'Contracts' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('lists active categories', async () => {
      await expect(service.listCategories('admin-1')).resolves.toHaveLength(1);

      expect(mockDocuments.listCategories).toHaveBeenCalledWith();
    });

    it('rejects empty category updates', async () => {
      await expect(
        service.updateCategory('category-1', {}, 'admin-1'),
      ).rejects.toThrow(BadRequestException);

      expect(mockDocuments.updateCategory).not.toHaveBeenCalled();
    });

    it('rejects updates to nonexistent categories', async () => {
      mockDocuments.findCategoryById.mockResolvedValue(null);

      await expect(
        service.updateCategory(
          'missing-category',
          { categoryName: 'Updated Contracts' },
          'admin-1',
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockDocuments.updateCategory).not.toHaveBeenCalled();
    });

    it('updates category metadata', async () => {
      await service.updateCategory(
        'category-1',
        {
          categoryName: 'Approved Contracts',
          isActive: false,
        },
        'admin-1',
      );

      expect(mockDocuments.updateCategory).toHaveBeenCalledWith('category-1', {
        categoryName: 'Approved Contracts',
        description: undefined,
        isActive: false,
      });
    });

    it('handles duplicate names on category updates', async () => {
      mockDocuments.updateCategory.mockRejectedValue({
        code: 'P2002',
      });

      await expect(
        service.updateCategory(
          'category-1',
          { categoryName: 'Contracts' },
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('reports categories removed concurrently', async () => {
      mockDocuments.updateCategory.mockRejectedValue({
        code: 'P2025',
      });

      await expect(
        service.updateCategory(
          'category-1',
          { categoryName: 'New Contracts' },
          'admin-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('disables categories referenced by documents', async () => {
      mockDocuments.countCategoryDocuments.mockResolvedValue(2);

      await expect(
        service.deleteCategory('category-1', 'admin-1'),
      ).resolves.toHaveProperty('disabled', true);

      expect(mockDocuments.disableCategory).toHaveBeenCalledWith('category-1');

      expect(mockDocuments.deleteUnusedCategory).not.toHaveBeenCalled();
    });

    it('deletes unused categories', async () => {
      await expect(
        service.deleteCategory('category-1', 'admin-1'),
      ).resolves.toHaveProperty('disabled', false);

      expect(mockDocuments.deleteUnusedCategory).toHaveBeenCalledWith(
        'category-1',
      );
    });

    it('disables categories after a foreign-key conflict', async () => {
      mockDocuments.deleteUnusedCategory.mockRejectedValue({
        code: 'P2003',
      });

      await expect(
        service.deleteCategory('category-1', 'admin-1'),
      ).resolves.toHaveProperty('disabled', true);

      expect(mockDocuments.disableCategory).toHaveBeenCalledWith('category-1');
    });

    it('disables a category when conditional deletion affects zero rows', async () => {
      mockDocuments.deleteUnusedCategory.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.deleteCategory('category-1', 'admin-1'),
      ).resolves.toHaveProperty('disabled', true);

      expect(mockDocuments.disableCategory).toHaveBeenCalledWith('category-1');
    });

    it('reports a referenced category removed during deactivation', async () => {
      mockDocuments.countCategoryDocuments.mockResolvedValue(2);
      mockDocuments.disableCategory.mockRejectedValue({ code: 'P2025' });

      await expect(
        service.deleteCategory('category-1', 'admin-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockDocuments.disableCategory).toHaveBeenCalledWith('category-1');
      expect(mockDocuments.deleteUnusedCategory).not.toHaveBeenCalled();
    });

    it('handles categories removed during conditional deletion', async () => {
      mockDocuments.deleteUnusedCategory.mockResolvedValue({ count: 0 });

      mockDocuments.findCategoryById
        .mockResolvedValueOnce({
          id: 'category-1',
          categoryName: 'Contracts',
          isActive: true,
        })
        .mockResolvedValueOnce(null);

      await expect(
        service.deleteCategory('category-1', 'admin-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockDocuments.disableCategory).not.toHaveBeenCalled();
    });

    it('rejects deletion of nonexistent categories', async () => {
      mockDocuments.findCategoryById.mockResolvedValue(null);

      await expect(
        service.deleteCategory('missing-category', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
