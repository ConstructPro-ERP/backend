import { Injectable, Logger } from '@nestjs/common';
import {
  v2 as cloudinary,
  UploadApiResponse,
  UploadApiErrorResponse,
} from 'cloudinary';
import { Readable } from 'node:stream';

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
   * @returns The secure HTTPS URL of the uploaded asset
   */
  async uploadBuffer(
    buffer: Buffer,
    folder: string,
    filename: string,
    resourceType: 'raw' | 'image' | 'auto' = 'raw',
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
          if (error || !result) {
            this.logger.error(
              `Cloudinary upload failed for ${folder}/${filename}:`,
              error,
            );
            return reject(
              error ?? new Error('Cloudinary upload returned empty response'),
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
}
