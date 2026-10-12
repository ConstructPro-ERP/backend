import { randomUUID } from 'node:crypto';
import {
  CloudinaryService,
  type DocumentResourceType,
} from '../../libs/common/src/cloudinary/cloudinary.service';

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
});
