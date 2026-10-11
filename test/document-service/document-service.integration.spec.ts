import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  DocumentStorageStatus,
  ProjectStatus,
  UserStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { DocumentModule } from '../../apps/document-service/src/document.module';
import { DocumentReconciliationService } from '../../apps/document-service/src/document-reconciliation.service';
import { DocumentRepository } from '../../apps/document-service/src/repositories/document.repository';
import {
  CloudinaryService,
  type DocumentResourceType,
} from '../../libs/common/src/cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.setTimeout(60000);

const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const signedUrl = 'https://example.test/signed-document';

const mockCloudinary = {
  uploadAuthenticatedBuffer: jest.fn(),
  findAuthenticatedAsset: jest.fn(),
  createAuthenticatedDownloadUrl: jest.fn(),
  deleteAuthenticatedAsset: jest.fn(),
};

interface DocumentResponse {
  id: string;
  projectId: string;
  categoryId: string;
  originalName: string;
  fileSize: number;
  uploadedById: string;
}

interface DocumentPage {
  data: DocumentResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

describe('Document Service — Neon database integration', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let reconciliation: DocumentReconciliationService;
  let documents: DocumentRepository;
  let adminId: string;
  let managerId: string;
  let otherManagerId: string;
  let accountantId: string;
  let salesId: string;
  let inactiveSalesId: string;

  const runId = randomUUID();
  const userIds: string[] = [];
  const projectIds: string[] = [];
  const categoryIds: string[] = [];

  async function createProject(projectManagerId = managerId) {
    const project = await prisma.project.create({
      data: {
        projectName: `Documents Integration ${runId}`,
        projectManagerId,
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        status: ProjectStatus.ACTIVE,
      },
    });

    projectIds.push(project.id);
    return project;
  }

  async function createCategory(label = 'Contracts') {
    const category = await prisma.documentCategory.create({
      data: { categoryName: `${label}-${runId}-${randomUUID()}` },
    });

    categoryIds.push(category.id);
    return category;
  }

  function uploadDocument(
    projectId: string,
    categoryId: string,
    actorId = managerId,
    filename = 'contract.pdf',
  ) {
    return request(server)
      .post(`/projects/${projectId}/documents`)
      .set('x-user-id', actorId)
      .field('categoryId', categoryId)
      .field('description', 'Approved contract')
      .attach('file', pdf, { filename, contentType: 'application/pdf' });
  }

  // Reconciliation normally scans the whole database. Restrict these tests to
  // records they created so shared CI workers cannot affect other test data.
  async function reconcileTestDocuments() {
    const scan = jest.spyOn(documents, 'findStaleForReconciliation');
    scan.mockImplementation(async (before: Date, take = 25) =>
      prisma.document.findMany({
        where: {
          projectId: { in: projectIds },
          deletedAt: null,
          storageStatus: {
            in: [
              DocumentStorageStatus.PENDING,
              DocumentStorageStatus.FAILED,
              DocumentStorageStatus.DELETING,
            ],
          },
          updatedAt: { lt: before },
        },
        select: {
          id: true,
          storageStatus: true,
          cloudinaryPublicId: true,
          cloudinaryResourceType: true,
          fileSize: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take,
      }),
    );

    try {
      return await reconciliation.reconcile();
    } finally {
      scan.mockRestore();
    }
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [DocumentModule],
    })
      .overrideProvider(CloudinaryService)
      .useValue(mockCloudinary)
      .compile();

    prisma = module.get(PrismaService);
    reconciliation = module.get(DocumentReconciliationService);
    documents = module.get(DocumentRepository);

    const roles = await Promise.all(
      ['ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT', 'SALES_MANAGER'].map(
        (roleName) => prisma.role.findUniqueOrThrow({ where: { roleName } }),
      ),
    );

    async function createUser(
      label: string,
      roleId: string,
      status: UserStatus = UserStatus.ACTIVE,
    ) {
      const user = await prisma.user.create({
        data: {
          fullName: `Document Integration ${label}`,
          email: `document-${label}-${runId}@example.test`,
          password: 'test-password-hash',
          roleId,
          status,
        },
      });

      userIds.push(user.id);
      return user.id;
    }

    adminId = await createUser('admin', roles[0].id);
    managerId = await createUser('manager', roles[1].id);
    otherManagerId = await createUser('other-manager', roles[1].id);
    accountantId = await createUser('accountant', roles[2].id);
    salesId = await createUser('sales', roles[3].id);
    inactiveSalesId = await createUser(
      'inactive-sales',
      roles[3].id,
      UserStatus.INACTIVE,
    );

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockCloudinary.uploadAuthenticatedBuffer.mockImplementation(
      (buffer: Buffer, publicId: string, resourceType: DocumentResourceType) =>
        Promise.resolve({
          publicId,
          resourceType,
          bytes: buffer.length,
        }),
    );
    mockCloudinary.createAuthenticatedDownloadUrl.mockReturnValue(signedUrl);
    mockCloudinary.deleteAuthenticatedAsset.mockResolvedValue(undefined);
    mockCloudinary.findAuthenticatedAsset.mockResolvedValue(null);
  });

  afterEach(async () => {
    if (projectIds.length > 0 || categoryIds.length > 0) {
      await prisma.document.deleteMany({
        where: {
          OR: [
            { projectId: { in: projectIds } },
            { categoryId: { in: categoryIds } },
          ],
        },
      });
    }

    if (projectIds.length > 0) {
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
      projectIds.length = 0;
    }

    if (categoryIds.length > 0) {
      await prisma.documentCategory.deleteMany({
        where: { id: { in: categoryIds } },
      });
      categoryIds.length = 0;
    }
  });

  afterAll(async () => {
    if (prisma && userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  it('persists upload, reads metadata, signs download, and soft-deletes', async () => {
    const project = await createProject();
    const category = await createCategory();

    const uploaded = await uploadDocument(project.id, category.id).expect(201);
    const document = uploaded.body as DocumentResponse;
    expect(document).toMatchObject({
      projectId: project.id,
      categoryId: category.id,
      originalName: 'contract.pdf',
      fileSize: pdf.length,
      uploadedById: managerId,
    });

    const saved = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(saved.storageStatus).toBe(DocumentStorageStatus.ACTIVE);
    expect(saved.cloudinaryPublicId).toMatch(
      new RegExp(`^constructpro/projects/${project.id}/[a-f0-9-]+\\.pdf$`),
    );
    expect(saved.fileUrl).toBeNull();
    expect(mockCloudinary.uploadAuthenticatedBuffer).toHaveBeenCalledWith(
      pdf,
      saved.cloudinaryPublicId,
      'raw',
    );

    const list = await request(server)
      .get(`/projects/${project.id}/documents`)
      .set('x-user-id', accountantId)
      .expect(200);
    const page = list.body as DocumentPage;
    expect(page.meta.total).toBe(1);
    expect(page.data[0].id).toBe(document.id);
    expect(page.data[0]).not.toHaveProperty('cloudinaryPublicId');

    const detail = await request(server)
      .get(`/documents/${document.id}`)
      .set('x-user-id', salesId)
      .expect(200);
    expect((detail.body as DocumentResponse).id).toBe(document.id);
    expect(detail.body).not.toHaveProperty('cloudinaryPublicId');

    const download = await request(server)
      .get(`/documents/${document.id}/download`)
      .set('x-user-id', managerId)
      .expect(200);
    expect(download.body).toEqual({
      downloadUrl: signedUrl,
      expiresInSeconds: 300,
    });
    expect(mockCloudinary.createAuthenticatedDownloadUrl).toHaveBeenCalledWith(
      saved.cloudinaryPublicId,
      'pdf',
      'raw',
    );

    await request(server)
      .delete(`/documents/${document.id}`)
      .set('x-user-id', managerId)
      .expect(200);
    expect(mockCloudinary.deleteAuthenticatedAsset).toHaveBeenCalledWith(
      saved.cloudinaryPublicId,
      'raw',
    );

    const deleted = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(deleted.storageStatus).toBe(DocumentStorageStatus.DELETED);
    expect(deleted.deletedAt).not.toBeNull();
    await request(server)
      .get(`/documents/${document.id}`)
      .set('x-user-id', adminId)
      .expect(404);
  });

  it('paginates and filters documents without leaking another project', async () => {
    const project = await createProject();
    const otherProject = await createProject(otherManagerId);
    const category = await createCategory();

    const first = await uploadDocument(
      project.id,
      category.id,
      managerId,
      'Alpha.pdf',
    ).expect(201);
    await uploadDocument(project.id, category.id, managerId, 'Beta.pdf').expect(
      201,
    );
    await uploadDocument(
      otherProject.id,
      category.id,
      otherManagerId,
      'Other.pdf',
    ).expect(201);

    const response = await request(server)
      .get(`/projects/${project.id}/documents`)
      .set('x-user-id', salesId)
      .query({ categoryId: category.id, search: 'alpha', page: 1, limit: 1 })
      .expect(200);

    const result = response.body as DocumentPage;
    expect(result.meta.total).toBe(1);
    expect(result.data.map((item) => item.id)).toEqual([
      (first.body as DocumentResponse).id,
    ]);

    const sorted = await request(server)
      .get(`/projects/${project.id}/documents`)
      .set('x-user-id', accountantId)
      .query({ sortBy: 'fileName', sortOrder: 'asc', page: 2, limit: 1 })
      .expect(200);
    expect((sorted.body as DocumentPage).meta.total).toBe(2);
    expect((sorted.body as DocumentPage).data[0].originalName).toBe('Beta.pdf');
  });

  it('creates, updates, lists and deletes unused categories', async () => {
    const created = await request(server)
      .post('/document-categories')
      .set('x-user-id', adminId)
      .send({ categoryName: `Unused-${runId}` })
      .expect(201);
    const categoryId = (created.body as { id: string }).id;
    categoryIds.push(categoryId);

    await request(server)
      .patch(`/document-categories/${categoryId}`)
      .set('x-user-id', adminId)
      .send({ description: 'Updated description', isActive: false })
      .expect(200);

    const updated = await prisma.documentCategory.findUniqueOrThrow({
      where: { id: categoryId },
    });
    expect(updated.isActive).toBe(false);
    expect(updated.description).toBe('Updated description');

    const visible = await request(server)
      .get('/document-categories')
      .set('x-user-id', salesId)
      .expect(200);
    expect(
      (visible.body as Array<{ id: string }>).some(
        (entry) => entry.id === categoryId,
      ),
    ).toBe(false);

    await request(server)
      .delete(`/document-categories/${categoryId}`)
      .set('x-user-id', adminId)
      .expect(200);
    expect(
      await prisma.documentCategory.findUnique({ where: { id: categoryId } }),
    ).toBeNull();
  });

  it('disables categories in use instead of deleting their history', async () => {
    const project = await createProject();
    const category = await createCategory();
    const document = await uploadDocument(project.id, category.id).expect(201);

    const response = await request(server)
      .delete(`/document-categories/${category.id}`)
      .set('x-user-id', adminId)
      .expect(200);
    expect((response.body as { disabled: boolean }).disabled).toBe(true);
    const storedCategory = await prisma.documentCategory.findUniqueOrThrow({
      where: { id: category.id },
    });
    expect(storedCategory.isActive).toBe(false);
    expect(
      await prisma.document.count({ where: { categoryId: category.id } }),
    ).toBe(1);

    await uploadDocument(project.id, category.id).expect(404);
    expect(
      await prisma.document.findUnique({
        where: { id: (document.body as DocumentResponse).id },
      }),
    ).not.toBeNull();
  });

  it('enforces assigned managers and read-only accountant and sales permissions', async () => {
    const project = await createProject();
    const category = await createCategory();
    const uploaded = await uploadDocument(project.id, category.id).expect(201);
    const id = (uploaded.body as DocumentResponse).id;

    for (const readerId of [accountantId, salesId]) {
      await request(server)
        .get(`/documents/${id}`)
        .set('x-user-id', readerId)
        .expect(200);
      await request(server)
        .get(`/documents/${id}/download`)
        .set('x-user-id', readerId)
        .expect(200);
      await request(server)
        .delete(`/documents/${id}`)
        .set('x-user-id', readerId)
        .expect(403);
      await uploadDocument(project.id, category.id, readerId).expect(403);
      await request(server)
        .post('/document-categories')
        .set('x-user-id', readerId)
        .send({ categoryName: `Denied-${randomUUID()}` })
        .expect(403);
    }

    await request(server)
      .get(`/documents/${id}`)
      .set('x-user-id', otherManagerId)
      .expect(403);
    await request(server)
      .get(`/documents/${id}/download`)
      .set('x-user-id', otherManagerId)
      .expect(403);
    await request(server)
      .get(`/documents/${id}`)
      .set('x-user-id', inactiveSalesId)
      .expect(403);
    await request(server).get(`/projects/${project.id}/documents`).expect(401);
    const unchanged = await prisma.document.findUniqueOrThrow({
      where: { id },
    });
    expect(unchanged.storageStatus).toBe(DocumentStorageStatus.ACTIVE);
  });

  it('rejects invalid projects, categories, files and completed project writes', async () => {
    const project = await createProject();
    const category = await createCategory();

    await uploadDocument(randomUUID(), category.id, adminId).expect(404);
    await uploadDocument(project.id, randomUUID(), adminId).expect(404);
    await request(server)
      .post(`/projects/${project.id}/documents`)
      .set('x-user-id', adminId)
      .field('categoryId', category.id)
      .attach('file', Buffer.from('not a PDF'), {
        filename: 'unsafe.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    await prisma.project.update({
      where: { id: project.id },
      data: { status: ProjectStatus.COMPLETED },
    });
    await uploadDocument(project.id, category.id, adminId).expect(409);
    await request(server)
      .get('/documents/not-a-uuid')
      .set('x-user-id', adminId)
      .expect(400);
    expect(
      await prisma.document.count({ where: { projectId: project.id } }),
    ).toBe(0);
  });

  it('recovers a pending database record after an uncertain upload', async () => {
    const project = await createProject();
    const category = await createCategory();
    mockCloudinary.uploadAuthenticatedBuffer.mockRejectedValueOnce(
      new Error('Upload timed out'),
    );

    await uploadDocument(project.id, category.id).expect(503);
    const pending = await prisma.document.findFirstOrThrow({
      where: { projectId: project.id },
    });
    expect(pending.storageStatus).toBe(DocumentStorageStatus.PENDING);

    await prisma.document.update({
      where: { id: pending.id },
      data: { updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });
    mockCloudinary.findAuthenticatedAsset.mockResolvedValueOnce({
      publicId: pending.cloudinaryPublicId,
      resourceType: 'raw',
      bytes: pending.fileSize,
    });

    const outcome = await reconcileTestDocuments();
    expect(outcome).toMatchObject({ activated: 1, errors: 0 });
    const recovered = await prisma.document.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(recovered.storageStatus).toBe(DocumentStorageStatus.ACTIVE);
  });

  it('compensates inconsistent provider metadata and cleans up the failed record', async () => {
    const project = await createProject();
    const category = await createCategory();
    mockCloudinary.uploadAuthenticatedBuffer.mockImplementationOnce(
      (buffer: Buffer, publicId: string, resourceType: DocumentResourceType) =>
        Promise.resolve({
          publicId,
          resourceType,
          bytes: buffer.length + 1,
        }),
    );

    await uploadDocument(project.id, category.id).expect(409);
    const failed = await prisma.document.findFirstOrThrow({
      where: { projectId: project.id },
    });
    expect(failed.storageStatus).toBe(DocumentStorageStatus.FAILED);
    expect(mockCloudinary.deleteAuthenticatedAsset).toHaveBeenCalledWith(
      failed.cloudinaryPublicId,
      'raw',
    );

    await prisma.document.update({
      where: { id: failed.id },
      data: { updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });
    const outcome = await reconcileTestDocuments();
    expect(outcome).toMatchObject({ cleaned: 1, errors: 0 });
    const cleaned = await prisma.document.findUniqueOrThrow({
      where: { id: failed.id },
    });
    expect(cleaned.storageStatus).toBe(DocumentStorageStatus.FAILED);
    expect(cleaned.deletedAt).not.toBeNull();
  });

  it('recovers a deletion interrupted by Cloudinary failure', async () => {
    const project = await createProject();
    const category = await createCategory();
    const upload = await uploadDocument(project.id, category.id).expect(201);
    const id = (upload.body as DocumentResponse).id;
    mockCloudinary.deleteAuthenticatedAsset.mockRejectedValueOnce(
      new Error('Cloudinary unavailable'),
    );

    await request(server)
      .delete(`/documents/${id}`)
      .set('x-user-id', managerId)
      .expect(503);
    const inProgress = await prisma.document.findUniqueOrThrow({
      where: { id },
    });
    expect(inProgress.storageStatus).toBe(DocumentStorageStatus.DELETING);

    await prisma.document.update({
      where: { id },
      data: { updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });
    const outcome = await reconcileTestDocuments();
    expect(outcome).toMatchObject({ deleted: 1, errors: 0 });
    const deleted = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(deleted.storageStatus).toBe(DocumentStorageStatus.DELETED);
    expect(deleted.deletedAt).not.toBeNull();
  });
});
