import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { Document } from '@prisma/client';
import { extname } from 'node:path';
import { CloudinaryService } from '../../../../libs/common/src/cloudinary/cloudinary.service';
import {
  MAX_DIRECT_DOCUMENT_FILE_SIZE_BYTES,
  requiresDocumentContentInspection,
  validateDocumentFile,
  validateDocumentUploadMetadata,
} from './document-file.validator';

export type StoredDocumentVerification = 'valid' | 'invalid' | 'missing';

export type StoredDocumentMetadata = Pick<
  Document,
  | 'cloudinaryPublicId'
  | 'cloudinaryResourceType'
  | 'originalName'
  | 'mimeType'
  | 'fileSize'
>;

export async function verifyStoredDocument(
  cloudinary: CloudinaryService,
  document: StoredDocumentMetadata,
): Promise<StoredDocumentVerification> {
  const resourceType = document.cloudinaryResourceType;

  if (resourceType !== 'image' && resourceType !== 'raw') {
    throw new Error('Unsupported stored document resource type.');
  }

  const asset = await cloudinary.findAuthenticatedAsset(
    document.cloudinaryPublicId,
    resourceType,
  );

  if (!asset) {
    return 'missing';
  }

  if (
    asset.bytes !== document.fileSize ||
    asset.bytes <= 0 ||
    asset.bytes > MAX_DIRECT_DOCUMENT_FILE_SIZE_BYTES
  ) {
    return 'invalid';
  }

  try {
    const validated = validateDocumentUploadMetadata({
      fileName: document.originalName,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
    });

    if (validated.resourceType !== resourceType) {
      return 'invalid';
    }

    if (!requiresDocumentContentInspection(validated.extension)) {
      return 'valid';
    }
  } catch (error: unknown) {
    if (
      error instanceof BadRequestException ||
      error instanceof PayloadTooLargeException
    ) {
      return 'invalid';
    }

    throw error;
  }

  const format = extname(document.originalName).slice(1).toLowerCase();

  const buffer = await cloudinary.downloadAuthenticatedAssetBytes(
    document.cloudinaryPublicId,
    format,
    resourceType,
    MAX_DIRECT_DOCUMENT_FILE_SIZE_BYTES,
  );

  if (buffer.length !== document.fileSize) {
    return 'invalid';
  }

  try {
    const validated = validateDocumentFile(
      {
        originalname: document.originalName,
        mimetype: document.mimeType,
        size: buffer.length,
        buffer,
      },
      MAX_DIRECT_DOCUMENT_FILE_SIZE_BYTES,
    );

    return validated.resourceType === resourceType ? 'valid' : 'invalid';
  } catch (error: unknown) {
    if (
      error instanceof BadRequestException ||
      error instanceof PayloadTooLargeException
    ) {
      return 'invalid';
    }

    throw error;
  }
}
