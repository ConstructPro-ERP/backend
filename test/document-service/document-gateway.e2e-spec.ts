import { HttpModule } from '@nestjs/axios';
import {
  ConflictException,
  ForbiddenException,
  INestApplication,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { DocumentsGatewayController } from '../../apps/api-gateway/src/controllers/documents-gateway.controller';
import { HttpExceptionFilter } from '../../apps/api-gateway/src/filters/http-exception.filter';
import { JwtAuthGuard } from '../../apps/api-gateway/src/guards/jwt-auth.guard';
import { RolesGuard } from '../../apps/api-gateway/src/guards/roles.guard';
import { ResponseInterceptor } from '../../apps/api-gateway/src/interceptors/response.interceptor';
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

const actors: Record<string, { id: string; role: string }> = {
  admin: { id: 'admin-user', role: 'ADMIN' },
  manager: { id: 'manager-user', role: 'PROJECT_MANAGER' },
  accountant: { id: 'accountant-user', role: 'ACCOUNTANT' },
  sales: { id: 'sales-user', role: 'SALES_MANAGER' },
  client: { id: 'client-user', role: 'CLIENT_PORTAL_USER' },
};

const mockDocuments = {
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

interface GatewayBody<T> {
  success: boolean;
  data: T;
}

describe('Documents — Gateway to Document Service E2E', () => {
  let documentApp: INestApplication;
  let gatewayApp: INestApplication;
  let gatewayServer: Server;
  let authServer: Server;

  const originalDocumentUrl = process.env.DOCUMENT_SERVICE_URL;
  const originalAuthUrl = process.env.AUTH_SERVICE_URL;

  const token = (role: string): string => `Bearer ${role}`;

  beforeAll(async () => {
    const documentModule = await Test.createTestingModule({
      controllers: [DocumentController],
      providers: [
        {
          provide: DocumentService,
          useValue: mockDocuments,
        },
      ],
    }).compile();

    documentApp = documentModule.createNestApplication();

    documentApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await documentApp.listen(0, '127.0.0.1');

    process.env.DOCUMENT_SERVICE_URL = await documentApp.getUrl();

    authServer = createServer((req, res) => {
      if (req.url !== '/auth/me') {
        res.writeHead(404);
        res.end();
        return;
      }

      const label = (req.headers.authorization ?? '').replace(/^Bearer /, '');

      const actor = actors[label];

      if (!actor) {
        res.writeHead(401, {
          'content-type': 'application/json',
        });

        res.end(JSON.stringify({ code: 'TOKEN_INVALID' }));
        return;
      }

      res.writeHead(200, {
        'content-type': 'application/json',
      });

      res.end(JSON.stringify(actor));
    });

    await new Promise<void>((resolve) => {
      authServer.listen(0, '127.0.0.1', resolve);
    });

    const address = authServer.address();

    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve Auth Service port.');
    }

    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${address.port}`;

    const gatewayModule = await Test.createTestingModule({
      imports: [HttpModule],
      controllers: [DocumentsGatewayController],
      providers: [JwtAuthGuard, RolesGuard, Reflector],
    }).compile();

    gatewayApp = gatewayModule.createNestApplication();

    gatewayApp.useLogger(['log', 'warn']);
    gatewayApp.setGlobalPrefix('api');

    gatewayApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    gatewayApp.useGlobalInterceptors(new ResponseInterceptor());
    gatewayApp.useGlobalFilters(new HttpExceptionFilter());

    await gatewayApp.init();

    gatewayServer = gatewayApp.getHttpServer() as Server;
  });

  beforeEach(() => {
    jest.resetAllMocks();

    mockDocuments.upload.mockResolvedValue({ id: documentId });
    mockDocuments.findAll.mockResolvedValue({
      data: [{ id: documentId }],
      meta: {
        page: 2,
        limit: 5,
        total: 1,
        totalPages: 1,
      },
    });
    mockDocuments.findOne.mockResolvedValue({ id: documentId });
    mockDocuments.download.mockResolvedValue({
      downloadUrl: 'https://example.com/signed-document',
      expiresInSeconds: 300,
    });
    mockDocuments.downloadForClient.mockResolvedValue({
      downloadUrl: 'https://example.com/signed-document',
      expiresInSeconds: 300,
    });
    mockDocuments.remove.mockResolvedValue({
      message: 'Document deleted successfully.',
    });
    mockDocuments.createCategory.mockResolvedValue({ id: categoryId });
    mockDocuments.listCategories.mockResolvedValue([
      { id: categoryId, categoryName: 'Contracts' },
    ]);
    mockDocuments.updateCategory.mockResolvedValue({
      id: categoryId,
      isActive: false,
    });
    mockDocuments.deleteCategory.mockResolvedValue({
      disabled: true,
    });
  });

  afterAll(async () => {
    await gatewayApp.close();
    await documentApp.close();

    await new Promise<void>((resolve, reject) => {
      authServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    if (originalDocumentUrl === undefined) {
      delete process.env.DOCUMENT_SERVICE_URL;
    } else {
      process.env.DOCUMENT_SERVICE_URL = originalDocumentUrl;
    }

    if (originalAuthUrl === undefined) {
      delete process.env.AUTH_SERVICE_URL;
    } else {
      process.env.AUTH_SERVICE_URL = originalAuthUrl;
    }
  });

  it('forwards multipart bytes and the verified manager identity', async () => {
    const fileBuffer = Buffer.from('test document contents');

    const response = await request(gatewayServer)
      .post(`/api/projects/${projectId}/documents`)
      .set('authorization', token('manager'))
      .set('x-user-id', actors.admin.id)
      .field('categoryId', categoryId)
      .field('description', 'Approved plan')
      .attach('file', fileBuffer, {
        filename: 'plan.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const body = response.body as GatewayBody<{ id: string }>;

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(documentId);

    expect(mockDocuments.upload).toHaveBeenCalledTimes(1);

    const calls = mockDocuments.upload.mock.calls[0] as [
      string,
      { categoryId: string; description: string },
      {
        originalname: string;
        mimetype: string;
        buffer: Buffer;
        size: number;
      },
      string,
    ];

    expect(calls[0]).toBe(projectId);
    expect(calls[1]).toEqual({
      categoryId,
      description: 'Approved plan',
    });
    expect(calls[2].originalname).toBe('plan.pdf');
    expect(calls[2].mimetype).toBe('application/pdf');
    expect(calls[2].size).toBe(fileBuffer.length);
    expect(calls[2].buffer.equals(fileBuffer)).toBe(true);
    expect(calls[3]).toBe(actors.manager.id);
  });

  it('rejects uploads without a file', async () => {
    await request(gatewayServer)
      .post(`/api/projects/${projectId}/documents`)
      .set('authorization', token('manager'))
      .field('categoryId', categoryId)
      .expect(400);

    expect(mockDocuments.upload).not.toHaveBeenCalled();
  });

  it('rejects oversized uploads with a document-specific error code', async () => {
    const response = await request(gatewayServer)
      .post(`/api/projects/${projectId}/documents`)
      .set('authorization', token('manager'))
      .field('categoryId', categoryId)
      .attach(
        'file',
        Buffer.alloc(MAX_DOCUMENT_FILE_SIZE_BYTES + 1),
        'oversized.pdf',
      )
      .expect(413);

    const body = response.body as {
      success: boolean;
      statusCode: number;
      code: string;
      message: string;
    };

    expect(body).toMatchObject({
      success: false,
      statusCode: 413,
      code: ErrorCode.DOCUMENT_FILE_TOO_LARGE,
      message: `Document exceeds the ${MAX_DOCUMENT_FILE_SIZE_MIB} MiB upload limit.`,
    });

    expect(mockDocuments.upload).not.toHaveBeenCalled();
  });

  it('rejects accountant document uploads', async () => {
    await request(gatewayServer)
      .post(`/api/projects/${projectId}/documents`)
      .set('authorization', token('accountant'))
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('file'), 'test.pdf')
      .expect(403);

    expect(mockDocuments.upload).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated document requests', async () => {
    await request(gatewayServer)
      .get(`/api/projects/${projectId}/documents`)
      .expect(401);

    expect(mockDocuments.findAll).not.toHaveBeenCalled();
  });

  it('allows sales managers to read documents and categories', async () => {
    await request(gatewayServer)
      .get(`/api/projects/${projectId}/documents`)
      .set('authorization', token('sales'))
      .expect(200);

    expect(mockDocuments.findAll).toHaveBeenCalledWith(
      projectId,
      expect.any(Object),
      actors.sales.id,
    );

    await request(gatewayServer)
      .get(`/api/documents/${documentId}`)
      .set('authorization', token('sales'))
      .expect(200);

    expect(mockDocuments.findOne).toHaveBeenCalledWith(
      documentId,
      actors.sales.id,
    );

    await request(gatewayServer)
      .get(`/api/documents/${documentId}/download`)
      .set('authorization', token('sales'))
      .expect(200);

    expect(mockDocuments.download).toHaveBeenCalledWith(
      documentId,
      actors.sales.id,
    );

    await request(gatewayServer)
      .get('/api/document-categories')
      .set('authorization', token('sales'))
      .expect(200);

    expect(mockDocuments.listCategories).toHaveBeenCalledWith(actors.sales.id);
  });

  it('prevents sales managers from modifying documents and categories', async () => {
    await request(gatewayServer)
      .post(`/api/projects/${projectId}/documents`)
      .set('authorization', token('sales'))
      .field('categoryId', categoryId)
      .attach('file', Buffer.from('test'), 'test.pdf')
      .expect(403);

    await request(gatewayServer)
      .delete(`/api/documents/${documentId}`)
      .set('authorization', token('sales'))
      .expect(403);

    await request(gatewayServer)
      .post('/api/document-categories')
      .set('authorization', token('sales'))
      .send({ categoryName: 'Drawings' })
      .expect(403);

    await request(gatewayServer)
      .patch(`/api/document-categories/${categoryId}`)
      .set('authorization', token('sales'))
      .send({ isActive: false })
      .expect(403);

    await request(gatewayServer)
      .delete(`/api/document-categories/${categoryId}`)
      .set('authorization', token('sales'))
      .expect(403);

    expect(mockDocuments.upload).not.toHaveBeenCalled();
    expect(mockDocuments.remove).not.toHaveBeenCalled();
    expect(mockDocuments.createCategory).not.toHaveBeenCalled();
    expect(mockDocuments.updateCategory).not.toHaveBeenCalled();
    expect(mockDocuments.deleteCategory).not.toHaveBeenCalled();
  });

  it('rejects client downloads until ownership is implemented', async () => {
    await request(gatewayServer)
      .get(`/api/documents/${documentId}/download`)
      .set('authorization', token('client'))
      .expect(403);

    expect(mockDocuments.download).not.toHaveBeenCalled();
  });

  it('forwards document filtering and pagination', async () => {
    await request(gatewayServer)
      .get(`/api/projects/${projectId}/documents`)
      .set('authorization', token('accountant'))
      .query({
        page: 2,
        limit: 5,
        categoryId,
        search: 'plan',
      })
      .expect(200);

    expect(mockDocuments.findAll).toHaveBeenCalledWith(
      projectId,
      expect.objectContaining({
        page: 2,
        limit: 5,
        categoryId,
        search: 'plan',
      }),
      actors.accountant.id,
    );
  });

  it('returns document metadata to authorized readers', async () => {
    await request(gatewayServer)
      .get(`/api/documents/${documentId}`)
      .set('authorization', token('accountant'))
      .expect(200);

    expect(mockDocuments.findOne).toHaveBeenCalledWith(
      documentId,
      actors.accountant.id,
    );
  });

  it('forwards signed download requests', async () => {
    const response = await request(gatewayServer)
      .get(`/api/documents/${documentId}/download`)
      .set('authorization', token('manager'))
      .expect(200);

    const body = response.body as GatewayBody<{
      downloadUrl: string;
      expiresInSeconds: number;
    }>;

    expect(body.data.expiresInSeconds).toBe(300);

    expect(mockDocuments.download).toHaveBeenCalledWith(
      documentId,
      actors.manager.id,
    );
  });

  it('forwards client downloads with verified identity', async () => {
    const response = await request(gatewayServer)
      .get(`/api/client-portal/documents/${documentId}/download`)
      .set('authorization', token('client'))
      .set('x-user-id', actors.admin.id)
      .expect(200);

    const body = response.body as GatewayBody<{
      downloadUrl: string;
      expiresInSeconds: number;
    }>;

    expect(body.data.expiresInSeconds).toBe(300);

    expect(mockDocuments.downloadForClient).toHaveBeenCalledWith(
      documentId,
      actors.client.id,
    );
  });

  it('rejects non-client roles on client download routes', async () => {
    await request(gatewayServer)
      .get(`/api/client-portal/documents/${documentId}/download`)
      .set('authorization', token('admin'))
      .expect(403);

    expect(mockDocuments.downloadForClient).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated client downloads', async () => {
    await request(gatewayServer)
      .get(`/api/client-portal/documents/${documentId}/download`)
      .expect(401);

    expect(mockDocuments.downloadForClient).not.toHaveBeenCalled();
  });

  it('allows managers to delete documents but not accountants', async () => {
    await request(gatewayServer)
      .delete(`/api/documents/${documentId}`)
      .set('authorization', token('manager'))
      .expect(200);

    expect(mockDocuments.remove).toHaveBeenCalledWith(
      documentId,
      actors.manager.id,
    );

    await request(gatewayServer)
      .delete(`/api/documents/${documentId}`)
      .set('authorization', token('accountant'))
      .expect(403);

    expect(mockDocuments.remove).toHaveBeenCalledTimes(1);
  });

  it('allows administrators to manage categories', async () => {
    await request(gatewayServer)
      .post('/api/document-categories')
      .set('authorization', token('admin'))
      .send({ categoryName: 'Contracts' })
      .expect(201);

    expect(mockDocuments.createCategory).toHaveBeenCalledWith(
      { categoryName: 'Contracts' },
      actors.admin.id,
    );

    await request(gatewayServer)
      .patch(`/api/document-categories/${categoryId}`)
      .set('authorization', token('admin'))
      .send({ isActive: false })
      .expect(200);

    expect(mockDocuments.updateCategory).toHaveBeenCalledWith(
      categoryId,
      { isActive: false },
      actors.admin.id,
    );

    await request(gatewayServer)
      .delete(`/api/document-categories/${categoryId}`)
      .set('authorization', token('admin'))
      .expect(200);

    expect(mockDocuments.deleteCategory).toHaveBeenCalledWith(
      categoryId,
      actors.admin.id,
    );
  });

  it('allows accountants to list but not modify categories', async () => {
    await request(gatewayServer)
      .get('/api/document-categories')
      .set('authorization', token('accountant'))
      .expect(200);

    expect(mockDocuments.listCategories).toHaveBeenCalledWith(
      actors.accountant.id,
    );

    await request(gatewayServer)
      .post('/api/document-categories')
      .set('authorization', token('accountant'))
      .send({ categoryName: 'Contracts' })
      .expect(403);

    expect(mockDocuments.createCategory).not.toHaveBeenCalled();
  });

  it('rejects invalid document UUIDs before forwarding', async () => {
    await request(gatewayServer)
      .get('/api/documents/invalid-uuid')
      .set('authorization', token('admin'))
      .expect(400);

    expect(mockDocuments.findOne).not.toHaveBeenCalled();
  });

  it('preserves project access errors returned downstream', async () => {
    mockDocuments.findAll.mockRejectedValueOnce(
      new ForbiddenException({
        code: ErrorCode.PROJECT_ACCESS_DENIED,
        message: 'Project access denied.',
      }),
    );

    const response = await request(gatewayServer)
      .get(`/api/projects/${projectId}/documents`)
      .set('authorization', token('manager'))
      .expect(403);

    const body = response.body as {
      code: string;
    };

    expect(body.code).toBe(ErrorCode.PROJECT_ACCESS_DENIED);
  });

  it('rejects invalid upload metadata before forwarding', async () => {
    await request(gatewayServer)
      .post(`/api/projects/${projectId}/documents`)
      .set('authorization', token('manager'))
      .field('categoryId', 'invalid-category')
      .attach('file', Buffer.from('test'), {
        filename: 'contract.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    expect(mockDocuments.upload).not.toHaveBeenCalled();
  });

  it('rejects invalid document listing parameters', async () => {
    await request(gatewayServer)
      .get(`/api/projects/${projectId}/documents`)
      .set('authorization', token('manager'))
      .query({
        page: 0,
        limit: 101,
        sortBy: 'invalid',
      })
      .expect(400);

    expect(mockDocuments.findAll).not.toHaveBeenCalled();
  });

  it('rejects invalid category create and update requests', async () => {
    await request(gatewayServer)
      .post('/api/document-categories')
      .set('authorization', token('admin'))
      .send({ categoryName: '   ' })
      .expect(400);

    await request(gatewayServer)
      .patch(`/api/document-categories/${categoryId}`)
      .set('authorization', token('admin'))
      .send({ isActive: 'false' })
      .expect(400);

    expect(mockDocuments.createCategory).not.toHaveBeenCalled();
    expect(mockDocuments.updateCategory).not.toHaveBeenCalled();
  });

  it('propagates document storage failures', async () => {
    mockDocuments.download.mockRejectedValueOnce(
      new ServiceUnavailableException('Document storage unavailable.'),
    );

    await request(gatewayServer)
      .get(`/api/documents/${documentId}/download`)
      .set('authorization', token('manager'))
      .expect(503);

    expect(mockDocuments.download).toHaveBeenCalledWith(
      documentId,
      actors.manager.id,
    );
  });

  it('propagates duplicate category conflicts', async () => {
    mockDocuments.createCategory.mockRejectedValueOnce(
      new ConflictException('Document category already exists.'),
    );

    await request(gatewayServer)
      .post('/api/document-categories')
      .set('authorization', token('admin'))
      .send({ categoryName: 'Contracts' })
      .expect(409);

    expect(mockDocuments.createCategory).toHaveBeenCalledWith(
      { categoryName: 'Contracts' },
      actors.admin.id,
    );
  });

  it('rejects invalid bearer tokens', async () => {
    await request(gatewayServer)
      .get(`/api/documents/${documentId}`)
      .set('authorization', 'Bearer invalid-token')
      .expect(401);

    expect(mockDocuments.findOne).not.toHaveBeenCalled();
  });
});
