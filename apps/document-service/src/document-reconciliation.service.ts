import { Injectable, Logger } from '@nestjs/common';
import { DocumentStorageStatus } from '@prisma/client';
import {
  CloudinaryService,
  type DocumentResourceType,
} from '../../../libs/common/src/cloudinary/cloudinary.service';
import { DocumentRepository } from './repositories/document.repository';

const STALE_AFTER_MS = 60 * 60 * 1000;
const MISSING_UPLOAD_GRACE_MS = 24 * STALE_AFTER_MS;
const BATCH_SIZE = 25;

export interface DocumentReconciliationResult {
  checked: number;
  activated: number;
  failed: number;
  cleaned: number;
  deleted: number;
  pending: number;
  errors: number;
}

@Injectable()
export class DocumentReconciliationService {
  private readonly logger = new Logger(DocumentReconciliationService.name);

  constructor(
    private readonly documents: DocumentRepository,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async reconcile(): Promise<DocumentReconciliationResult> {
    const now = Date.now();
    const cutoff = new Date(now - STALE_AFTER_MS);

    const records = await this.documents.findStaleForReconciliation(
      cutoff,
      BATCH_SIZE,
    );

    const result: DocumentReconciliationResult = {
      checked: 0,
      activated: 0,
      failed: 0,
      cleaned: 0,
      deleted: 0,
      pending: 0,
      errors: 0,
    };

    for (const record of records) {
      result.checked += 1;

      try {
        const resourceType = this.resourceType(record.cloudinaryResourceType);

        if (record.storageStatus === DocumentStorageStatus.PENDING) {
          const asset = await this.cloudinary.findAuthenticatedAsset(
            record.cloudinaryPublicId,
            resourceType,
          );

          if (!asset) {
            if (now - record.updatedAt.getTime() < MISSING_UPLOAD_GRACE_MS) {
              result.pending += 1;
              continue;
            }

            const failed = await this.documents.markUploadFailed(record.id);

            if (failed.count === 1) {
              result.failed += 1;
            } else {
              await this.assertResolvedUploadState(record.id);
            }

            continue;
          }

          if (asset.bytes !== record.fileSize) {
            const failed = await this.documents.markUploadFailed(record.id);

            if (failed.count === 1) {
              result.failed += 1;
            } else {
              await this.assertResolvedUploadState(record.id);
            }

            continue;
          }

          const activated = await this.documents.markUploadActive(record.id);

          if (activated.count === 1) {
            result.activated += 1;
          } else {
            await this.assertCurrentStatus(
              record.id,
              DocumentStorageStatus.ACTIVE,
            );
          }

          continue;
        }

        if (record.storageStatus === DocumentStorageStatus.FAILED) {
          await this.cloudinary.deleteAuthenticatedAsset(
            record.cloudinaryPublicId,
            resourceType,
          );

          const cleaned = await this.documents.markFailedCleaned(record.id);

          if (cleaned.count === 1) {
            result.cleaned += 1;
          } else {
            const current = await this.documents.findByIdForReconciliation(
              record.id,
            );

            if (
              current?.storageStatus !== DocumentStorageStatus.FAILED ||
              current.deletedAt === null
            ) {
              throw new Error(
                `Failed document ${record.id} could not be finalized.`,
              );
            }
          }

          continue;
        }

        if (record.storageStatus === DocumentStorageStatus.DELETING) {
          await this.cloudinary.deleteAuthenticatedAsset(
            record.cloudinaryPublicId,
            resourceType,
          );

          const deleted = await this.documents.finishDelete(record.id);

          if (deleted.count === 1) {
            result.deleted += 1;
          } else {
            await this.assertCurrentStatus(
              record.id,
              DocumentStorageStatus.DELETED,
            );
          }
        }
      } catch (error: unknown) {
        result.errors += 1;

        this.logger.error(
          `Document reconciliation failed for ${record.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return result;
  }

  private resourceType(value: string): DocumentResourceType {
    if (value === 'image' || value === 'raw') {
      return value;
    }

    throw new Error(`Unsupported stored resource type: ${value}`);
  }

  private async assertResolvedUploadState(id: string): Promise<void> {
    const current = await this.documents.findByIdForReconciliation(id);

    if (
      current?.storageStatus !== DocumentStorageStatus.ACTIVE &&
      current?.storageStatus !== DocumentStorageStatus.FAILED
    ) {
      throw new Error(`Document ${id} changed during upload reconciliation.`);
    }
  }

  private async assertCurrentStatus(
    id: string,
    expected: DocumentStorageStatus,
  ): Promise<void> {
    const current = await this.documents.findByIdForReconciliation(id);

    if (current?.storageStatus !== expected) {
      throw new Error(
        `Document ${id} did not reach expected state ${expected}.`,
      );
    }
  }
}
