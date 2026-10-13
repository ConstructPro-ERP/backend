import { Injectable, Logger } from '@nestjs/common';
import {
  v2 as cloudinary,
  UploadApiResponse,
  UploadApiErrorResponse,
} from 'cloudinary';
import { Readable } from 'node:stream';

export type DocumentResourceType = 'image' | 'raw';

export interface AuthenticatedUploadResult {
  publicId: string;
  resourceType: DocumentResourceType;
  bytes: number;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private isConfigured = false;

  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log(
        `Cloudinary configured successfully for cloud: ${cloudName}`,
      );
    } else {
      this.logger.warn(
        'Cloudinary environment variables (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are not fully defined.',
      );
    }
  }

  /**
   * Upload an in-memory buffer to Cloudinary
   * @param buffer File buffer (PDF, image, etc.)
   * @param folder Folder inside Cloudinary (e.g., 'quotations', 'invoices', 'projects')
   * @param filename Desired filename/public ID
   * @param resourceType 'raw' for PDFs and docs, 'image' for pictures, or 'auto'
   * @param timeoutMs Maximum time to wait for upload before timing out (default 8000ms)
   * @returns The secure HTTPS URL of the uploaded asset
   */
  async uploadBuffer(
    buffer: Buffer,
    folder: string,
    filename: string,
    resourceType: 'raw' | 'image' | 'auto' = 'raw',
    timeoutMs = 8000,
  ): Promise<string> {
    if (!this.isConfigured) {
      // Re-check in case environment variables were populated after bootstrap
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      if (cloudName && apiKey && apiSecret) {
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
          secure: true,
        });
        this.isConfigured = true;
      } else {
        throw new Error(
          'Cannot upload to Cloudinary: Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET.',
        );
      }
    }

    return new Promise<string>((resolve, reject) => {
      let isSettled = false;
      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          this.logger.error(
            `Cloudinary upload timed out after ${timeoutMs}ms for ${folder}/${filename}`,
          );
          reject(
            new Error(
              `Cloudinary upload timed out after ${timeoutMs}ms for ${folder}/${filename}`,
            ),
          );
        }
      }, timeoutMs);

      if (timer && typeof timer.unref === 'function') {
        timer.unref();
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `constructpro/${folder}`,
          public_id: filename,
          resource_type: resourceType,
          overwrite: true,
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (isSettled) return;
          clearTimeout(timer);
          isSettled = true;
          if (error || !result) {
            this.logger.error(
              `Cloudinary upload failed for ${folder}/${filename}:`,
              error,
            );

            return reject(
              new Error(
                error?.message ?? 'Cloudinary upload returned empty response',
              ),
            );
          }
          this.logger.log(`Uploaded to Cloudinary: ${result.secure_url}`);
          resolve(result.secure_url);
        },
      );

      const stream = Readable.from(buffer);
      stream.pipe(uploadStream);
    });
  }

  async uploadAuthenticatedBuffer(
    buffer: Buffer,
    publicId: string,
    resourceType: DocumentResourceType,
  ): Promise<AuthenticatedUploadResult> {
    this.ensureDocumentStorageConfigured();

    if (buffer.length === 0) {
      throw new Error('Cannot upload an empty document.');
    }

    if (!publicId.startsWith('constructpro/projects/')) {
      throw new Error('Invalid project document public ID.');
    }

    return new Promise<AuthenticatedUploadResult>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: resourceType,
          type: 'authenticated',
          overwrite: false,
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error || !result) {
            this.logger.error(
              `Authenticated document upload failed for ${publicId}.`,
            );
            return reject(
              new Error(
                error?.message ?? 'Cloudinary returned no upload result.',
              ),
            );
          }

          if (
            result.public_id !== publicId ||
            result.type !== 'authenticated' ||
            result.resource_type !== resourceType
          ) {
            return reject(
              new Error('Cloudinary returned unexpected asset metadata.'),
            );
          }

          resolve({
            publicId: result.public_id,
            resourceType,
            bytes: result.bytes,
          });
        },
      );

      uploadStream.on('error', (error: Error) => reject(error));
      uploadStream.end(buffer);
    });
  }

  async findAuthenticatedAsset(
    publicId: string,
    resourceType: DocumentResourceType,
  ): Promise<AuthenticatedUploadResult | null> {
    this.ensureDocumentStorageConfigured();

    try {
      const result: unknown = await cloudinary.api.resource(publicId, {
        resource_type: resourceType,
        type: 'authenticated',
      });

      if (
        !result ||
        typeof result !== 'object' ||
        !('public_id' in result) ||
        result.public_id !== publicId ||
        !('resource_type' in result) ||
        result.resource_type !== resourceType ||
        !('type' in result) ||
        result.type !== 'authenticated' ||
        !('bytes' in result) ||
        typeof result.bytes !== 'number'
      ) {
        throw new Error('Cloudinary returned invalid asset metadata.');
      }

      return {
        publicId: result.public_id,
        resourceType,
        bytes: result.bytes,
      };
    } catch (error: unknown) {
      if (this.isCloudinaryNotFound(error)) {
        return null;
      }

      throw error;
    }
  }

  createAuthenticatedDownloadUrl(
    publicId: string,
    format: string,
    resourceType: DocumentResourceType,
  ): string {
    this.ensureDocumentStorageConfigured();

    const expiresAt = Math.floor(Date.now() / 1000) + 300;

    return cloudinary.utils.private_download_url(publicId, format, {
      resource_type: resourceType,
      type: 'authenticated',
      expires_at: expiresAt,
      attachment: true,
    });
  }

  async deleteAuthenticatedAsset(
    publicId: string,
    resourceType: DocumentResourceType,
  ): Promise<void> {
    this.ensureDocumentStorageConfigured();

    const response: unknown = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: 'authenticated',
      invalidate: true,
    });

    if (
      !response ||
      typeof response !== 'object' ||
      !('result' in response) ||
      (response.result !== 'ok' && response.result !== 'not found')
    ) {
      throw new Error('Cloudinary did not confirm asset deletion.');
    }
  }

  private ensureDocumentStorageConfigured(): void {
    if (this.isConfigured) {
      return;
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary document storage is not configured.');
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    this.isConfigured = true;
  }

  private isCloudinaryNotFound(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const response = error as {
      http_code?: unknown;
      error?: { http_code?: unknown };
    };

    return response.http_code === 404 || response.error?.http_code === 404;
  }
}
