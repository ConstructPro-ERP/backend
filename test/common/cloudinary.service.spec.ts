import { CloudinaryService } from '../../libs/common/src/cloudinary/cloudinary.service';
import {
  v2 as cloudinary,
  type UploadApiErrorResponse,
  type UploadApiResponse,
} from 'cloudinary';
import { PassThrough } from 'node:stream';

// Match the Cloudinary SDK callback contract in test mocks.
type UploadCallback = (
  error?: UploadApiErrorResponse,
  result?: UploadApiResponse,
) => void;

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    utils: {
      private_download_url: jest.fn(),
    },
    uploader: {
      upload_stream: jest.fn(),
      destroy: jest.fn(),
    },
    api: {
      resource: jest.fn(),
    },
  },
}));

describe('CloudinaryService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      CLOUDINARY_CLOUD_NAME: 'test-cloud',
      CLOUDINARY_API_KEY: 'test-key',
      CLOUDINARY_API_SECRET: 'test-secret',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('configures Cloudinary on initialization when env vars are present', () => {
    new CloudinaryService();
    expect(cloudinary.config).toHaveBeenCalledWith({
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
      secure: true,
    });
  });

  it('uploads a buffer successfully and returns the secure URL', async () => {
    const mockUploadStream = new PassThrough();
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_options: unknown, callback: UploadCallback) => {
        // Emit callback asynchronously
        setImmediate(() => {
          callback(undefined, {
            secure_url:
              'https://res.cloudinary.com/test-cloud/raw/upload/v1234/test.pdf',
          } as UploadApiResponse);
        });
        return mockUploadStream;
      },
    );

    const service = new CloudinaryService();
    const buffer = Buffer.from('dummy pdf content');

    const result = await service.uploadBuffer(
      buffer,
      'quotations',
      'quotation-123',
      'raw',
    );

    expect(result).toBe(
      'https://res.cloudinary.com/test-cloud/raw/upload/v1234/test.pdf',
    );
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      {
        folder: 'constructpro/quotations',
        public_id: 'quotation-123',
        resource_type: 'raw',
        overwrite: true,
      },
      expect.any(Function),
    );
  });

  it('rejects if upload_stream yields an error', async () => {
    const mockUploadStream = new PassThrough();
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_options: unknown, callback: UploadCallback) => {
        setImmediate(() => {
          const uploadError: UploadApiErrorResponse = {
            name: 'Error',
            message: 'Cloudinary stream network failure',
            http_code: 503,
          };

          callback(uploadError);
        });
        return mockUploadStream;
      },
    );

    const service = new CloudinaryService();
    const buffer = Buffer.from('dummy content');

    await expect(
      service.uploadBuffer(buffer, 'quotations', 'quotation-err', 'raw'),
    ).rejects.toThrow('Cloudinary stream network failure');
  });

  it('throws an error if environment variables are missing', async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    const service = new CloudinaryService();
    const buffer = Buffer.from('content');

    await expect(
      service.uploadBuffer(buffer, 'quotations', 'quotation-404', 'raw'),
    ).rejects.toThrow('Cannot upload to Cloudinary');
  });

  it('uploads a project document as an authenticated asset', async () => {
    const stream = new PassThrough();
    const publicId = 'constructpro/projects/project-1/document-1.pdf';
    const buffer = Buffer.from('test document');

    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_options: unknown, callback: UploadCallback) => {
        setImmediate(() => {
          callback(undefined, {
            public_id: publicId,
            type: 'authenticated',
            resource_type: 'raw',
            bytes: buffer.length,
          } as UploadApiResponse);
        });

        return stream;
      },
    );

    const service = new CloudinaryService();

    await expect(
      service.uploadAuthenticatedBuffer(buffer, publicId, 'raw'),
    ).resolves.toEqual({
      publicId,
      resourceType: 'raw',
      bytes: buffer.length,
    });

    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      {
        public_id: publicId,
        resource_type: 'raw',
        type: 'authenticated',
        overwrite: false,
      },
      expect.any(Function),
    );
  });

  it('rejects an empty document before uploading', async () => {
    const service = new CloudinaryService();

    await expect(
      service.uploadAuthenticatedBuffer(
        Buffer.alloc(0),
        'constructpro/projects/project-1/doc-1.pdf',
        'raw',
      ),
    ).rejects.toThrow('Cannot upload an empty document.');

    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });

  it('rejects invalid project document public IDs', async () => {
    const service = new CloudinaryService();

    await expect(
      service.uploadAuthenticatedBuffer(
        Buffer.from('file'),
        'constructpro/quotations/quotation-1',
        'raw',
      ),
    ).rejects.toThrow('Invalid project document public ID.');
  });

  it('rejects an authenticated upload when Cloudinary fails', async () => {
    const stream = new PassThrough();

    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_options: unknown, callback: UploadCallback) => {
        setImmediate(() => {
          callback({
            name: 'Error',
            message: 'Storage unavailable',
            http_code: 503,
          });
        });

        return stream;
      },
    );

    const service = new CloudinaryService();

    await expect(
      service.uploadAuthenticatedBuffer(
        Buffer.from('document'),
        'constructpro/projects/project-1/doc-2.pdf',
        'raw',
      ),
    ).rejects.toThrow('Storage unavailable');
  });

  it('rejects an upload response with an unexpected delivery type', async () => {
    const stream = new PassThrough();
    const publicId = 'constructpro/projects/project-1/doc-3.pdf';

    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_options: unknown, callback: UploadCallback) => {
        setImmediate(() => {
          callback(undefined, {
            public_id: publicId,
            type: 'upload',
            resource_type: 'raw',
            bytes: 8,
          } as UploadApiResponse);
        });

        return stream;
      },
    );

    const service = new CloudinaryService();

    await expect(
      service.uploadAuthenticatedBuffer(
        Buffer.from('document'),
        publicId,
        'raw',
      ),
    ).rejects.toThrow('Cloudinary returned unexpected asset metadata.');
  });

  it('generates an authenticated download URL expiring after five minutes', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);

    try {
      (cloudinary.utils.private_download_url as jest.Mock).mockReturnValue(
        'https://api.cloudinary.com/signed-download',
      );

      const service = new CloudinaryService();
      const publicId = 'constructpro/projects/project-1/doc-1.pdf';

      const url = service.createAuthenticatedDownloadUrl(
        publicId,
        'pdf',
        'raw',
      );

      expect(url).toBe('https://api.cloudinary.com/signed-download');

      expect(cloudinary.utils.private_download_url).toHaveBeenCalledWith(
        publicId,
        'pdf',
        {
          resource_type: 'raw',
          type: 'authenticated',
          expires_at: 1700000300,
          attachment: true,
        },
      );
    } finally {
      now.mockRestore();
    }
  });

  it('deletes authenticated assets successfully', async () => {
    (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({
      result: 'ok',
    });

    const service = new CloudinaryService();
    const publicId = 'constructpro/projects/project-1/doc-1.pdf';

    await expect(
      service.deleteAuthenticatedAsset(publicId, 'raw'),
    ).resolves.toBeUndefined();

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(publicId, {
      resource_type: 'raw',
      type: 'authenticated',
      invalidate: true,
    });
  });

  it('treats an already deleted asset as successfully removed', async () => {
    (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({
      result: 'not found',
    });

    const service = new CloudinaryService();

    await expect(
      service.deleteAuthenticatedAsset(
        'constructpro/projects/project-1/missing.pdf',
        'raw',
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects an unconfirmed Cloudinary deletion', async () => {
    (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({
      result: 'unexpected',
    });

    const service = new CloudinaryService();

    await expect(
      service.deleteAuthenticatedAsset(
        'constructpro/projects/project-1/doc-1.pdf',
        'raw',
      ),
    ).rejects.toThrow('Cloudinary did not confirm asset deletion.');
  });

  it('propagates Cloudinary deletion failures', async () => {
    (cloudinary.uploader.destroy as jest.Mock).mockRejectedValue(
      new Error('Provider unavailable'),
    );

    const service = new CloudinaryService();

    await expect(
      service.deleteAuthenticatedAsset(
        'constructpro/projects/project-1/doc-1.pdf',
        'raw',
      ),
    ).rejects.toThrow('Provider unavailable');
  });

  it('retrieves authenticated asset metadata', async () => {
    const publicId = 'constructpro/projects/project-1/doc-1.pdf';

    (cloudinary.api.resource as jest.Mock).mockResolvedValue({
      public_id: publicId,
      resource_type: 'raw',
      type: 'authenticated',
      bytes: 100,
    });

    const service = new CloudinaryService();

    await expect(
      service.findAuthenticatedAsset(publicId, 'raw'),
    ).resolves.toEqual({
      publicId,
      resourceType: 'raw',
      bytes: 100,
    });

    expect(cloudinary.api.resource).toHaveBeenCalledWith(publicId, {
      resource_type: 'raw',
      type: 'authenticated',
    });
  });

  it('returns null for a confirmed missing asset', async () => {
    (cloudinary.api.resource as jest.Mock).mockRejectedValue({
      error: { http_code: 404 },
    });

    const service = new CloudinaryService();

    await expect(
      service.findAuthenticatedAsset(
        'constructpro/projects/project-1/missing.pdf',
        'raw',
      ),
    ).resolves.toBeNull();
  });

  it('does not treat provider failures as missing assets', async () => {
    (cloudinary.api.resource as jest.Mock).mockRejectedValue({
      error: { http_code: 503 },
    });

    const service = new CloudinaryService();

    await expect(
      service.findAuthenticatedAsset(
        'constructpro/projects/project-1/doc-1.pdf',
        'raw',
      ),
    ).rejects.toEqual({
      error: { http_code: 503 },
    });
  });

  it('rejects with timeout error when upload exceeds timeout limit', async () => {
    const mockUploadStream = new PassThrough();
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(() => {
      // Deliberately do not invoke callback to simulate network stall
      return mockUploadStream;
    });

    const service = new CloudinaryService();
    const buffer = Buffer.from('dummy content');

    await expect(
      service.uploadBuffer(
        buffer,
        'quotations',
        'quotation-timeout',
        'raw',
        50,
      ),
    ).rejects.toThrow('Cloudinary upload timed out after 50ms');
  });
});
