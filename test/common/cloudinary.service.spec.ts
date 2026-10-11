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
    uploader: {
      upload_stream: jest.fn(),
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

  it('rejects with timeout error when upload exceeds timeout limit', async () => {
    const mockUploadStream = new PassThrough();
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      () => {
        // Deliberately do not invoke callback to simulate network stall
        return mockUploadStream;
      },
    );

    const service = new CloudinaryService();
    const buffer = Buffer.from('dummy content');

    await expect(
      service.uploadBuffer(buffer, 'quotations', 'quotation-timeout', 'raw', 50),
    ).rejects.toThrow('Cloudinary upload timed out after 50ms');
  });
});
