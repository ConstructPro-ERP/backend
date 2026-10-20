import { CloudinaryService } from '../../libs/common/src/cloudinary/cloudinary.service';
import { verifyStoredDocument } from '../../apps/document-service/src/validation/stored-document.validator';

const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

const document = {
  originalName: 'contract.pdf',
  mimeType: 'application/pdf',
  fileSize: pdf.length,
  cloudinaryPublicId: 'constructpro/projects/project-1/doc-1.pdf',
  cloudinaryResourceType: 'raw',
};

const mockCloudinary = {
  findAuthenticatedAsset: jest.fn(),
  downloadAuthenticatedAssetBytes: jest.fn(),
};

describe('Stored document verification', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    mockCloudinary.findAuthenticatedAsset.mockResolvedValue({
      publicId: document.cloudinaryPublicId,
      resourceType: 'raw',
      bytes: pdf.length,
    });

    mockCloudinary.downloadAuthenticatedAssetBytes.mockResolvedValue(pdf);
  });

  const verify = () =>
    verifyStoredDocument(
      mockCloudinary as unknown as CloudinaryService,
      document,
    );

  it('accepts a matching authenticated document with valid contents', async () => {
    await expect(verify()).resolves.toBe('valid');
  });

  it('returns missing when Cloudinary has not received the asset', async () => {
    mockCloudinary.findAuthenticatedAsset.mockResolvedValue(null);

    await expect(verify()).resolves.toBe('missing');
    expect(
      mockCloudinary.downloadAuthenticatedAssetBytes,
    ).not.toHaveBeenCalled();
  });

  it('rejects Cloudinary assets with mismatched sizes', async () => {
    mockCloudinary.findAuthenticatedAsset.mockResolvedValue({
      publicId: document.cloudinaryPublicId,
      resourceType: 'raw',
      bytes: pdf.length + 1,
    });

    await expect(verify()).resolves.toBe('invalid');
  });

  it('rejects forged content even when the file size matches', async () => {
    mockCloudinary.downloadAuthenticatedAssetBytes.mockResolvedValue(
      Buffer.alloc(pdf.length, 0x41),
    );

    await expect(verify()).resolves.toBe('invalid');
  });

  it('rejects a mismatch between downloaded and expected byte counts', async () => {
    mockCloudinary.downloadAuthenticatedAssetBytes.mockResolvedValue(
      Buffer.alloc(pdf.length - 1, 0x41),
    );

    await expect(verify()).resolves.toBe('invalid');
  });

  it('preserves provider errors for retry rather than accepting the file', async () => {
    mockCloudinary.downloadAuthenticatedAssetBytes.mockRejectedValue(
      new Error('Cloudinary temporarily unavailable'),
    );

    await expect(verify()).rejects.toThrow(
      'Cloudinary temporarily unavailable',
    );
  });

  it('verifies an opaque Revit asset without downloading its contents', async () => {
    const revit = {
      ...document,
      originalName: 'building.rvt',
      mimeType: 'application/octet-stream',
      cloudinaryPublicId: 'constructpro/projects/project-1/doc-1.rvt',
    };

    mockCloudinary.findAuthenticatedAsset.mockResolvedValue({
      publicId: revit.cloudinaryPublicId,
      resourceType: 'raw',
      bytes: revit.fileSize,
    });

    await expect(
      verifyStoredDocument(
        mockCloudinary as unknown as CloudinaryService,
        revit,
      ),
    ).resolves.toBe('valid');

    expect(mockCloudinary.findAuthenticatedAsset).toHaveBeenCalledWith(
      revit.cloudinaryPublicId,
      'raw',
    );

    expect(
      mockCloudinary.downloadAuthenticatedAssetBytes,
    ).not.toHaveBeenCalled();
  });

  it('rejects opaque files when Cloudinary reports a different size', async () => {
    const revit = {
      ...document,
      originalName: 'building.rvt',
      mimeType: 'application/octet-stream',
    };

    mockCloudinary.findAuthenticatedAsset.mockResolvedValue({
      publicId: revit.cloudinaryPublicId,
      resourceType: 'raw',
      bytes: revit.fileSize + 1,
    });

    await expect(
      verifyStoredDocument(
        mockCloudinary as unknown as CloudinaryService,
        revit,
      ),
    ).resolves.toBe('invalid');

    expect(
      mockCloudinary.downloadAuthenticatedAssetBytes,
    ).not.toHaveBeenCalled();
  });

  it('rejects unsupported opaque document extensions', async () => {
    await expect(
      verifyStoredDocument(mockCloudinary as unknown as CloudinaryService, {
        ...document,
        originalName: 'program.exe',
        mimeType: 'application/octet-stream',
      }),
    ).resolves.toBe('invalid');

    expect(
      mockCloudinary.downloadAuthenticatedAssetBytes,
    ).not.toHaveBeenCalled();
  });
});
