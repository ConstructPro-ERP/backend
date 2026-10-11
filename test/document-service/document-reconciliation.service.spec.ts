import { DocumentStorageStatus } from '@prisma/client';
import { DocumentReconciliationService } from '../../apps/document-service/src/document-reconciliation.service';
import { DocumentRepository } from '../../apps/document-service/src/repositories/document.repository';
import { CloudinaryService } from '../../libs/common/src/cloudinary/cloudinary.service';

const HOUR = 60 * 60 * 1000;

const record = {
  id: 'doc-1',
  storageStatus: DocumentStorageStatus.PENDING,
  cloudinaryPublicId: 'constructpro/projects/project-1/doc-1.pdf',
  cloudinaryResourceType: 'raw',
  fileSize: 100,
  updatedAt: new Date(Date.now() - 2 * HOUR),
};

const mockRepository = {
  findStaleForReconciliation: jest.fn(),
  findByIdForReconciliation: jest.fn(),
  markUploadActive: jest.fn(),
  markUploadFailed: jest.fn(),
  markFailedCleaned: jest.fn(),
  finishDelete: jest.fn(),
};

const mockCloudinary = {
  findAuthenticatedAsset: jest.fn(),
  deleteAuthenticatedAsset: jest.fn(),
};

describe('DocumentReconciliationService', () => {
  let service: DocumentReconciliationService;

  beforeEach(() => {
    jest.resetAllMocks();

    service = new DocumentReconciliationService(
      mockRepository as unknown as DocumentRepository,
      mockCloudinary as unknown as CloudinaryService,
    );

    mockRepository.findStaleForReconciliation.mockResolvedValue([record]);
    mockRepository.markUploadActive.mockResolvedValue({ count: 1 });
    mockRepository.markUploadFailed.mockResolvedValue({ count: 1 });
    mockRepository.markFailedCleaned.mockResolvedValue({ count: 1 });
    mockRepository.finishDelete.mockResolvedValue({ count: 1 });

    mockCloudinary.findAuthenticatedAsset.mockResolvedValue({
      publicId: record.cloudinaryPublicId,
      resourceType: 'raw',
      bytes: record.fileSize,
    });

    mockCloudinary.deleteAuthenticatedAsset.mockResolvedValue(undefined);
  });

  it('activates recovered uploads with matching Cloudinary metadata', async () => {
    const result = await service.reconcile();

    expect(result.activated).toBe(1);
    expect(result.errors).toBe(0);

    expect(mockRepository.markUploadActive).toHaveBeenCalledWith(record.id);

    expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
  });

  it('keeps recently missing uploads pending', async () => {
    mockCloudinary.findAuthenticatedAsset.mockResolvedValue(null);

    const result = await service.reconcile();

    expect(result.pending).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockRepository.markUploadFailed).not.toHaveBeenCalled();
  });

  it('marks uploads missing for more than 24 hours as failed', async () => {
    mockRepository.findStaleForReconciliation.mockResolvedValue([
      {
        ...record,
        updatedAt: new Date(Date.now() - 26 * HOUR),
      },
    ]);

    mockCloudinary.findAuthenticatedAsset.mockResolvedValue(null);

    const result = await service.reconcile();

    expect(result.failed).toBe(1);
    expect(mockRepository.markUploadFailed).toHaveBeenCalledWith(record.id);

    expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
  });

  it('moves inconsistent uploads to FAILED before cleanup', async () => {
    mockCloudinary.findAuthenticatedAsset.mockResolvedValue({
      publicId: record.cloudinaryPublicId,
      resourceType: 'raw',
      bytes: 50,
    });

    const result = await service.reconcile();

    expect(result.failed).toBe(1);
    expect(mockRepository.markUploadFailed).toHaveBeenCalledWith(record.id);

    expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
  });

  it('cleans up failed uploads', async () => {
    mockRepository.findStaleForReconciliation.mockResolvedValue([
      {
        ...record,
        storageStatus: DocumentStorageStatus.FAILED,
      },
    ]);

    const result = await service.reconcile();

    expect(result.cleaned).toBe(1);

    expect(mockCloudinary.deleteAuthenticatedAsset).toHaveBeenCalledWith(
      record.cloudinaryPublicId,
      'raw',
    );

    expect(mockRepository.markFailedCleaned).toHaveBeenCalledWith(record.id);
  });

  it('retries abandoned deletions', async () => {
    mockRepository.findStaleForReconciliation.mockResolvedValue([
      {
        ...record,
        storageStatus: DocumentStorageStatus.DELETING,
      },
    ]);

    const result = await service.reconcile();

    expect(result.deleted).toBe(1);

    expect(mockCloudinary.deleteAuthenticatedAsset).toHaveBeenCalledWith(
      record.cloudinaryPublicId,
      'raw',
    );

    expect(mockRepository.finishDelete).toHaveBeenCalledWith(record.id);
  });

  it('records individual provider failures', async () => {
    mockCloudinary.findAuthenticatedAsset.mockRejectedValue(
      new Error('Cloudinary unavailable'),
    );

    const result = await service.reconcile();

    expect(result.checked).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.activated).toBe(0);

    expect(mockRepository.markUploadActive).not.toHaveBeenCalled();
    expect(mockRepository.markUploadFailed).not.toHaveBeenCalled();
  });

  it('does not delete assets after a concurrent upload activation', async () => {
    mockCloudinary.findAuthenticatedAsset.mockResolvedValue({
      publicId: record.cloudinaryPublicId,
      resourceType: 'raw',
      bytes: 50,
    });

    mockRepository.markUploadFailed.mockResolvedValue({ count: 0 });

    mockRepository.findByIdForReconciliation.mockResolvedValue({
      storageStatus: DocumentStorageStatus.ACTIVE,
    });

    const result = await service.reconcile();

    expect(result.errors).toBe(0);

    expect(mockCloudinary.deleteAuthenticatedAsset).not.toHaveBeenCalled();
  });

  it('limits reconciliation to a bounded batch', async () => {
    await service.reconcile();

    const call = mockRepository.findStaleForReconciliation.mock
      .calls[0] as unknown as [Date, number];

    expect(call[0]).toBeInstanceOf(Date);
    expect(call[1]).toBe(25);
  });
});
