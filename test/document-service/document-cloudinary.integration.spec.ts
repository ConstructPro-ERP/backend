import { randomUUID } from 'node:crypto';
import {
  CloudinaryService,
  type DocumentResourceType,
  type SignedDocumentUpload,
} from '../../libs/common/src/cloudinary/cloudinary.service';
import { verifyStoredDocument } from '../../apps/document-service/src/validation/stored-document.validator';

function createTestPdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];

  let content = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content, 'ascii'));
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(content, 'ascii');

  content += `xref\n0 ${offsets.length}\n`;
  content += '0000000000 65535 f \n';

  for (const offset of offsets.slice(1)) {
    content += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  content += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\n`;
  content += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(content, 'ascii');
}

const pdf = createTestPdf();

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

interface LiveTestCase {
  name: string;
  resourceType: DocumentResourceType;
  format: string;
  buffer: Buffer;
}

const cases: LiveTestCase[] = [
  {
    name: 'PDF',
    resourceType: 'raw',
    format: 'pdf',
    buffer: pdf,
  },
  {
    name: 'PNG',
    resourceType: 'image',
    format: 'png',
    buffer: png,
  },
];

interface SignedUploadCase {
  name: string;
  fileName: string;
  mimeType: string;
  resourceType: DocumentResourceType;
  buffer: Buffer;
}

const signedCases: SignedUploadCase[] = [
  {
    name: 'PDF',
    fileName: 'contract.pdf',
    mimeType: 'application/pdf',
    resourceType: 'raw',
    buffer: pdf,
  },
  {
    name: 'PNG',
    fileName: 'drawing.png',
    mimeType: 'image/png',
    resourceType: 'image',
    buffer: png,
  },
  {
    name: 'opaque Revit attachment',
    fileName: 'building.rvt',
    mimeType: 'application/octet-stream',
    resourceType: 'raw',
    buffer: Buffer.from('ConstructPro integration test Revit attachment'),
  },
];

interface CloudinaryUploadResponse {
  public_id?: string;
  resource_type?: string;
  type?: string;
  bytes?: number;
}

async function uploadWithSignature(
  authorization: SignedDocumentUpload,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  overrides: Record<string, string> = {},
) {
  const form = new FormData();

  form.set(
    'file',
    new Blob([Uint8Array.from(buffer)], { type: mimeType }),
    fileName,
  );

  for (const [key, value] of Object.entries(authorization.uploadParameters)) {
    form.set(key, String(value));
  }

  form.set('api_key', authorization.apiKey);
  form.set('signature', authorization.signature);

  for (const [key, value] of Object.entries(overrides)) {
    form.set(key, value);
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(
      authorization.cloudName,
    )}/${authorization.resourceType}/upload`,
    {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60000),
    },
  );

  const body = (await response.json()) as CloudinaryUploadResponse;

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

describe('Document Service real Cloudinary integration', () => {
  beforeAll(() => {
    const required = [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ];

    const missing = required.filter((name) => !process.env[name]);

    if (missing.length > 0) {
      throw new Error(`Missing Cloudinary credentials: ${missing.join(', ')}`);
    }
  });

  it.each(cases)(
    'uploads, inspects, downloads and deletes a $name',
    async ({ resourceType, format, buffer }) => {
      const cloudinary = new CloudinaryService();
      const uniqueId = randomUUID();

      const publicId =
        `constructpro/projects/ci-${uniqueId}/document-${uniqueId}` +
        (resourceType === 'raw' ? `.${format}` : '');

      try {
        const uploaded = await cloudinary.uploadAuthenticatedBuffer(
          buffer,
          publicId,
          resourceType,
        );

        expect(uploaded).toEqual({
          publicId,
          resourceType,
          bytes: buffer.length,
        });

        const stored = await cloudinary.findAuthenticatedAsset(
          publicId,
          resourceType,
        );

        expect(stored).toEqual(uploaded);

        const signedUrl = cloudinary.createAuthenticatedDownloadUrl(
          publicId,
          format,
          resourceType,
        );

        expect(signedUrl).toMatch(/^https:\/\//);

        const response = await fetch(signedUrl);

        expect(response.status).toBe(200);

        const downloaded = Buffer.from(await response.arrayBuffer());

        if (resourceType === 'raw') {
          expect(downloaded.equals(buffer)).toBe(true);
        } else {
          expect(downloaded.subarray(0, 8).equals(pngSignature)).toBe(true);
        }
      } finally {
        await cloudinary.deleteAuthenticatedAsset(publicId, resourceType);
      }

      await expect(
        cloudinary.findAuthenticatedAsset(publicId, resourceType),
      ).resolves.toBeNull();
    },
    90000,
  );

  it.each(signedCases)(
    'uploads and verifies a signed $name',
    async ({ fileName, mimeType, resourceType, buffer }) => {
      const cloudinary = new CloudinaryService();
      const projectId = randomUUID();
      const documentId = randomUUID();

      const extension = fileName.slice(fileName.lastIndexOf('.'));

      const publicId =
        `constructpro/projects/${projectId}/${documentId}` +
        (resourceType === 'raw' ? extension : '');

      const authorization = cloudinary.createSignedDocumentUpload(
        publicId,
        resourceType,
      );

      expect(authorization.uploadParameters).toMatchObject({
        public_id: publicId,
        type: 'authenticated',
        overwrite: 'false',
      });

      expect(authorization).not.toHaveProperty('apiSecret');

      try {
        const result = await uploadWithSignature(
          authorization,
          buffer,
          fileName,
          mimeType,
        );

        expect(result.status).toBe(200);

        expect(result.body).toMatchObject({
          public_id: publicId,
          resource_type: resourceType,
          type: 'authenticated',
          bytes: buffer.length,
        });

        const stored = await cloudinary.findAuthenticatedAsset(
          publicId,
          resourceType,
        );

        expect(stored).toMatchObject({
          publicId,
          resourceType,
          bytes: buffer.length,
        });

        const verification = await verifyStoredDocument(cloudinary, {
          originalName: fileName,
          mimeType,
          fileSize: buffer.length,
          cloudinaryPublicId: publicId,
          cloudinaryResourceType: resourceType,
        });

        expect(verification).toBe('valid');

        const format = extension.slice(1);
        const downloadUrl = cloudinary.createAuthenticatedDownloadUrl(
          publicId,
          format,
          resourceType,
        );

        const download = await fetch(downloadUrl, {
          signal: AbortSignal.timeout(60000),
        });

        expect(download.status).toBe(200);

        const downloaded = Buffer.from(await download.arrayBuffer());

        if (resourceType === 'raw') {
          expect(downloaded.equals(buffer)).toBe(true);
        } else {
          expect(downloaded.subarray(0, 8).equals(pngSignature)).toBe(true);
        }
      } finally {
        await cloudinary.deleteAuthenticatedAsset(publicId, resourceType);
      }

      await expect(
        cloudinary.findAuthenticatedAsset(publicId, resourceType),
      ).resolves.toBeNull();
    },
    120000,
  );

  it('rejects attempts to change a signed public ID', async () => {
    const cloudinary = new CloudinaryService();

    const projectId = randomUUID();
    const publicId = `constructpro/projects/${projectId}/${randomUUID()}.pdf`;

    const changedPublicId = `constructpro/projects/${projectId}/${randomUUID()}.pdf`;

    const authorization = cloudinary.createSignedDocumentUpload(
      publicId,
      'raw',
    );

    try {
      const result = await uploadWithSignature(
        authorization,
        pdf,
        'contract.pdf',
        'application/pdf',
        { public_id: changedPublicId },
      );

      expect(result.ok).toBe(false);

      await expect(
        cloudinary.findAuthenticatedAsset(changedPublicId, 'raw'),
      ).resolves.toBeNull();
    } finally {
      await cloudinary.deleteAuthenticatedAsset(publicId, 'raw');
      await cloudinary.deleteAuthenticatedAsset(changedPublicId, 'raw');
    }
  }, 120000);

  it('preserves the original asset when upload credentials are reused', async () => {
    const cloudinary = new CloudinaryService();

    const publicId = `constructpro/projects/${randomUUID()}/${randomUUID()}.pdf`;

    const authorization = cloudinary.createSignedDocumentUpload(
      publicId,
      'raw',
    );

    try {
      const first = await uploadWithSignature(
        authorization,
        pdf,
        'contract.pdf',
        'application/pdf',
      );

      expect(first.status).toBe(200);

      const changedPdf = Buffer.from('%PDF-1.7\nModified document\n%%EOF\n');

      await uploadWithSignature(
        authorization,
        changedPdf,
        'contract.pdf',
        'application/pdf',
      );

      const stored = await cloudinary.findAuthenticatedAsset(publicId, 'raw');

      expect(stored?.bytes).toBe(pdf.length);

      const actualBytes = await cloudinary.downloadAuthenticatedAssetBytes(
        publicId,
        'pdf',
        'raw',
        50 * 1024 * 1024,
      );

      expect(actualBytes.equals(pdf)).toBe(true);
    } finally {
      await cloudinary.deleteAuthenticatedAsset(publicId, 'raw');
    }
  }, 120000);
});
