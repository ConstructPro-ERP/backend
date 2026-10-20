import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { DocumentController } from '../../apps/document-service/src/document.controller';
import { DocumentService } from '../../apps/document-service/src/document.service';
import {
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_DOCUMENT_FILE_SIZE_MIB,
} from '../../apps/document-service/src/validation/document-file.validator';
import { ErrorCode } from '../../shared/error-codes';

const projectId = 'b390c2c8-86f5-484f-ad9f-170bca22703d';
const documentId = 'f5ff5c48-922c-4f43-b49b-9330f422d041';
const categoryId = 'b649b52f-69e5-43e1-8a56-f81c5f8f5a92';
const actorId = 'admin-1';

const mockDocuments = {
  authorizeUpload: jest.fn(),
  completeUpload: jest.fn(),
  upload: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  download: jest.fn(),
  downloadForClient: jest.fn(),
  remove: jest.fn(),
  createCategory: jest.fn(),
  listCategories: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
};

describe('DocumentController', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DocumentController],
      providers: [
        {
          provide: DocumentService,
          useValue: mockDocuments,
        },
      ],
    }).compile();

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

    mockDocuments.authorizeUpload.mockResolvedValue({
      documentId,
      signature: 'test-signature',
    });
    mockDocuments.completeUpload.mockResolvedValue({
      id: documentId,
      projectId,
    });
    mockDocuments.upload.mockResolvedValue({ id: documentId });
    mockDocuments.findAll.mockResolvedValue({
      data: [],
      meta: {
        page: 2,
        limit: 5,
        total: 0,
        totalPages: 0,
      },
    });
    mockDocuments.findOne.mockResolvedValue({ id: documentId });
    mockDocuments.download.mockResolvedValue({
      downloadUrl: 'https://example.com/signed',
      expiresInSeconds: 300,
    });
    mockDocuments.downloadForClient.mockResolvedValue({
      downloadUrl: 'https://example.com/signed',
      expiresInSeconds: 300,
    });
    mockDocuments.remove.mockResolvedValue({
      message: 'Document deleted successfully.',
    });
    mockDocuments.createCategory.mockResolvedValue({ id: categoryId });
    mockDocuments.listCategories.mockResolvedValue([]);
    mockDocuments.updateCategory.mockResolvedValue({
      id: categoryId,
      isActive: false,
    });
    mockDocuments.deleteCategory.mockResolvedValue({
      disabled: true,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts valid direct upload authorization requests', async () => {
    const payload = {
      categoryId,
      fileName: 'contract.pdf',
      mimeType: 'application/pdf',
      fileSize: 10485760,
    };

    await request(server)
      .post(`/projects/${projectId}/documents/upload-authorizations`)
      .set('x-user-id', actorId)
      .send(payload)
      .expect(201);

    expect(mockDocuments.authorizeUpload).toHaveBeenCalledWith(
      projectId,
      payload,
      actorId,
    );
  });

  it('rejects invalid direct upload authorization metadata', async () => {
    await request(server)
      .post(`/projects/${projectId}/documents/upload-authorizations`)
      .set('x-user-id', actorId)
      .send({
        categoryId,
        fileName: 'contract.pdf',
        mimeType: 'application/pdf',
        fileSize: -1,
      })
      .expect(400);

    expect(mockDocuments.authorizeUpload).not.toHaveBeenCalled();
  });

  it('forwards valid upload completion requests', async () => {
    await request(server)
      .post(`/projects/${projectId}/documents/${documentId}/complete`)
      .set('x-user-id', actorId)
      .send({})
      .expect(201);

    expect(mockDocuments.completeUpload).toHaveBeenCalledWith(
      projectId,
      documentId,
      actorId,
    );
  });

  it('rejects invalid document IDs during completion', async () => {
    await request(server)
      .post(`/projects/${projectId}/documents/invalid-id/complete`)
      .set('x-user-id', actorId)
      .send({})
      .expect(400);

    expect(mockDocuments.completeUpload).not.toHaveBeenCalled();
  });

  it('accepts multipart document uploads', async () => {
    await request(server)
      .post(`/projects/${projectId}/documents`)
      .set('x-user-id', actorId)
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('test PDF content'), {
        filename: 'contract.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(mockDocuments.upload).toHaveBeenCalledWith(
      projectId,
      { categoryId },
      expect.objectContaining({
        originalname: 'contract.pdf',
        mimetype: 'application/pdf',
        buffer: expect.any(Buffer) as Buffer,
      }),
      actorId,
    );
  });

  it('rejects invalid upload category identifiers', async () => {
    await request(server)
      .post(`/projects/${projectId}/documents`)
      .set('x-user-id', actorId)
      .field('categoryId', 'invalid-category')
      .attach('file', Buffer.from('test'), 'contract.pdf')
      .expect(400);

    expect(mockDocuments.upload).not.toHaveBeenCalled();
  });

  it('rejects oversized multipart uploads with the correct error code', async () => {
    const response = await request(server)
      .post(`/projects/${projectId}/documents`)
      .set('x-user-id', actorId)
      .field('categoryId', categoryId)
      .attach(
        'file',
        Buffer.alloc(MAX_DOCUMENT_FILE_SIZE_BYTES + 1),
        'large.pdf',
      )
      .expect(413);

    const body = response.body as {
      code: string;
      message: string;
    };

    expect(response.status).toBe(413);

    expect(body).toMatchObject({
      code: ErrorCode.DOCUMENT_FILE_TOO_LARGE,
      message: `Document exceeds the ${MAX_DOCUMENT_FILE_SIZE_MIB} MiB upload limit.`,
    });

    expect(mockDocuments.upload).not.toHaveBeenCalled();
  });

  it('rejects multiple files in a single document upload', async () => {
    await request(server)
      .post(`/projects/${projectId}/documents`)
      .set('x-user-id', actorId)
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('first'), 'first.pdf')
      .attach('file', Buffer.from('second'), 'second.pdf')
      .expect(400);

    expect(mockDocuments.upload).not.toHaveBeenCalled();
  });

  it('forwards document pagination and filters', async () => {
    await request(server)
      .get(`/projects/${projectId}/documents`)
      .set('x-user-id', actorId)
      .query({
        page: '2',
        limit: '5',
        categoryId,
        search: 'contract',
      })
      .expect(200);

    expect(mockDocuments.findAll).toHaveBeenCalledWith(
      projectId,
      expect.objectContaining({
        page: 2,
        limit: 5,
        categoryId,
        search: 'contract',
      }),
      actorId,
    );
  });

  it('retrieves document metadata', async () => {
    await request(server)
      .get(`/documents/${documentId}`)
      .set('x-user-id', actorId)
      .expect(200);

    expect(mockDocuments.findOne).toHaveBeenCalledWith(documentId, actorId);
  });

  it('returns a temporary signed download URL', async () => {
    await request(server)
      .get(`/documents/${documentId}/download`)
      .set('x-user-id', actorId)
      .expect(200);

    expect(mockDocuments.download).toHaveBeenCalledWith(documentId, actorId);
  });

  it('forwards client portal download requests', async () => {
    const clientActorId = 'client-1';

    const response = await request(server)
      .get(`/client-portal/documents/${documentId}/download`)
      .set('x-user-id', clientActorId)
      .expect(200);

    expect(response.body).toEqual({
      downloadUrl: 'https://example.com/signed',
      expiresInSeconds: 300,
    });

    expect(mockDocuments.downloadForClient).toHaveBeenCalledWith(
      documentId,
      clientActorId,
    );
  });

  it('deletes a document', async () => {
    await request(server)
      .delete(`/documents/${documentId}`)
      .set('x-user-id', actorId)
      .expect(200);

    expect(mockDocuments.remove).toHaveBeenCalledWith(documentId, actorId);
  });

  it('creates a document category', async () => {
    await request(server)
      .post('/document-categories')
      .set('x-user-id', actorId)
      .send({ categoryName: 'Contracts' })
      .expect(201);

    expect(mockDocuments.createCategory).toHaveBeenCalledWith(
      { categoryName: 'Contracts' },
      actorId,
    );
  });

  it('lists document categories', async () => {
    await request(server)
      .get('/document-categories')
      .set('x-user-id', actorId)
      .expect(200);

    expect(mockDocuments.listCategories).toHaveBeenCalledWith(actorId);
  });

  it('updates document categories', async () => {
    await request(server)
      .patch(`/document-categories/${categoryId}`)
      .set('x-user-id', actorId)
      .send({ isActive: false })
      .expect(200);

    expect(mockDocuments.updateCategory).toHaveBeenCalledWith(
      categoryId,
      { isActive: false },
      actorId,
    );
  });

  it('deletes or disables document categories', async () => {
    await request(server)
      .delete(`/document-categories/${categoryId}`)
      .set('x-user-id', actorId)
      .expect(200);

    expect(mockDocuments.deleteCategory).toHaveBeenCalledWith(
      categoryId,
      actorId,
    );
  });

  it('rejects invalid document IDs', async () => {
    await request(server)
      .get('/documents/invalid-id')
      .set('x-user-id', actorId)
      .expect(400);

    expect(mockDocuments.findOne).not.toHaveBeenCalled();
  });
});
