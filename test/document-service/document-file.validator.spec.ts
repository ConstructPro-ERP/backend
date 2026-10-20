import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_DIRECT_DOCUMENT_FILE_SIZE_BYTES,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  validateDocumentFile,
  validateDocumentUploadMetadata,
  type UploadedDocumentFile,
} from '../../apps/document-service/src/validation/document-file.validator';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const validDocx = readFileSync(
  join(__dirname, 'fixtures', 'valid-project-document.docx'),
);

function makeFile(
  name: string,
  mime: string,
  buffer: Buffer,
): UploadedDocumentFile {
  return {
    originalname: name,
    mimetype: mime,
    buffer,
    size: buffer.length,
  };
}

function corruptDocxEntry(
  mutate: (buffer: Buffer, entry: number, end: number) => void,
): Buffer {
  const corrupted = Buffer.from(validDocx);
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const end = corrupted.lastIndexOf(signature);

  if (end < 0) {
    throw new Error('DOCX fixture has no ZIP end record.');
  }

  let entry = corrupted.readUInt32LE(end + 16);
  const count = corrupted.readUInt16LE(end + 10);

  for (let i = 0; i < count; i++) {
    if (corrupted.readUInt32LE(entry) !== 0x02014b50) {
      throw new Error('DOCX fixture has an invalid ZIP directory.');
    }

    const nameLength = corrupted.readUInt16LE(entry + 28);
    const extraLength = corrupted.readUInt16LE(entry + 30);
    const commentLength = corrupted.readUInt16LE(entry + 32);
    const name = corrupted.toString(
      'utf8',
      entry + 46,
      entry + 46 + nameLength,
    );

    if (name === '[Content_Types].xml') {
      mutate(corrupted, entry, end);
      return corrupted;
    }

    entry += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error('DOCX fixture is missing Content_Types.xml.');
}

describe('Document file validation', () => {
  const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

  it('accepts PDF content with matching metadata', () => {
    expect(
      validateDocumentFile(makeFile('contract.pdf', PDF_MIME, pdf)),
    ).toMatchObject({
      originalName: 'contract.pdf',
      mimeType: PDF_MIME,
      resourceType: 'raw',
      extension: '.pdf',
      fileSize: pdf.length,
    });
  });

  it('accepts a PNG image', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6vPYAAAAASUVORK5CYII=',
      'base64',
    );

    expect(
      validateDocumentFile(makeFile('plan.png', 'image/png', png)),
    ).toMatchObject({
      mimeType: 'image/png',
      resourceType: 'image',
      extension: '.png',
    });
  });

  it('accepts JPEG signature and resource mapping', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9]);

    expect(
      validateDocumentFile(makeFile('site.jpg', 'image/jpeg', jpeg)),
    ).toMatchObject({
      mimeType: 'image/jpeg',
      resourceType: 'image',
      extension: '.jpg',
    });
  });

  it('accepts a valid DOCX file', () => {
    expect(
      validateDocumentFile(
        makeFile('approved-contract.docx', DOCX_MIME, validDocx),
      ),
    ).toMatchObject({
      originalName: 'approved-contract.docx',
      mimeType: DOCX_MIME,
      fileSize: validDocx.length,
      extension: '.docx',
      resourceType: 'raw',
    });
  });

  it('accepts PDF files at exactly the 4 MiB limit', () => {
    const maximumPdf = Buffer.alloc(MAX_DOCUMENT_FILE_SIZE_BYTES, 0x20);

    pdf.copy(maximumPdf);
    Buffer.from('%%EOF').copy(maximumPdf, maximumPdf.length - 5);

    expect(
      validateDocumentFile(makeFile('maximum.pdf', PDF_MIME, maximumPdf)),
    ).toMatchObject({
      fileSize: MAX_DOCUMENT_FILE_SIZE_BYTES,
      extension: '.pdf',
      resourceType: 'raw',
    });
  });

  it('accepts the JPEG extension as well as JPG', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xd9]);

    expect(
      validateDocumentFile(makeFile('construction.jpeg', 'image/jpeg', jpeg)),
    ).toHaveProperty('extension', '.jpeg');
  });

  it('rejects JPEG content without the closing marker', () => {
    const incompleteJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]);

    expect(() =>
      validateDocumentFile(
        makeFile('incomplete.jpg', 'image/jpeg', incompleteJpeg),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a PNG with an invalid IHDR length', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6vPYAAAAASUVORK5CYII=',
      'base64',
    );

    png.writeUInt32BE(12, 8);

    expect(() =>
      validateDocumentFile(makeFile('invalid.png', 'image/png', png)),
    ).toThrow(BadRequestException);
  });

  it('rejects a missing file', () => {
    expect(() => validateDocumentFile(undefined)).toThrow(BadRequestException);
  });

  it('rejects an empty file', () => {
    expect(() =>
      validateDocumentFile(makeFile('empty.pdf', PDF_MIME, Buffer.alloc(0))),
    ).toThrow(BadRequestException);
  });

  it('rejects an oversized file with HTTP 413', () => {
    const oversized = Buffer.alloc(MAX_DOCUMENT_FILE_SIZE_BYTES + 1);
    const file = makeFile('large.pdf', PDF_MIME, oversized);

    expect(() => validateDocumentFile(file)).toThrow(PayloadTooLargeException);
  });

  it('rejects executable files', () => {
    expect(() =>
      validateDocumentFile(
        makeFile('program.exe', 'application/octet-stream', pdf),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a PDF falsely presented as a PNG', () => {
    expect(() =>
      validateDocumentFile(makeFile('plan.png', 'image/png', pdf)),
    ).toThrow(BadRequestException);
  });

  it('rejects filename and MIME mismatches', () => {
    expect(() =>
      validateDocumentFile(makeFile('contract.pdf', 'image/png', pdf)),
    ).toThrow(BadRequestException);
  });

  it('rejects forged file sizes', () => {
    const file = makeFile('contract.pdf', PDF_MIME, pdf);
    file.size = 1;

    expect(() => validateDocumentFile(file)).toThrow(BadRequestException);
  });

  it('rejects unsafe filenames', () => {
    for (const name of [
      '../contract.pdf',
      'folder\\contract.pdf',
      ' contract.pdf',
      'contract.pdf\n',
      'contract.pdf\u0000',
      'contract.pdf\u007f',
      `${'a'.repeat(252)}.pdf`,
    ]) {
      expect(() => validateDocumentFile(makeFile(name, PDF_MIME, pdf))).toThrow(
        BadRequestException,
      );
    }
  });

  it('rejects a malformed DOCX file', () => {
    expect(() =>
      validateDocumentFile(
        makeFile('contract.docx', DOCX_MIME, Buffer.from('PK')),
      ),
    ).toThrow(BadRequestException);
  });

  it.each([
    {
      name: 'encrypted ZIP entries',
      mutate: (zip: Buffer, entry: number) => {
        zip.writeUInt16LE(1, entry + 8);
      },
    },
    {
      name: 'unsupported compression methods',
      mutate: (zip: Buffer, entry: number) => {
        zip.writeUInt16LE(99, entry + 10);
      },
    },
    {
      name: 'path traversal entries',
      mutate: (zip: Buffer, entry: number) => {
        Buffer.from('../').copy(zip, entry + 46);
      },
    },
    {
      name: 'macro-related entries',
      mutate: (zip: Buffer, entry: number) => {
        Buffer.from('vbaProject.bin').copy(zip, entry + 46);
      },
    },
    {
      name: 'excessive uncompressed sizes',
      mutate: (zip: Buffer, entry: number) => {
        zip.writeUInt32LE(33 * 1024 * 1024, entry + 24);
      },
    },
    {
      name: 'corrupted local ZIP headers',
      mutate: (zip: Buffer, entry: number) => {
        const local = zip.readUInt32LE(entry + 42);
        zip.writeUInt32LE(0, local);
      },
    },
    {
      name: 'mismatched local filenames',
      mutate: (zip: Buffer, entry: number) => {
        const local = zip.readUInt32LE(entry + 42);
        zip[local + 30] ^= 0x01;
      },
    },
    {
      name: 'incorrect decompressed lengths',
      mutate: (zip: Buffer, entry: number) => {
        const size = zip.readUInt32LE(entry + 24);
        zip.writeUInt32LE(size + 1, entry + 24);
      },
    },
    {
      name: 'invalid compressed XML data',
      mutate: (zip: Buffer, entry: number) => {
        const local = zip.readUInt32LE(entry + 42);
        const start =
          local +
          30 +
          zip.readUInt16LE(local + 26) +
          zip.readUInt16LE(local + 28);

        zip.writeUInt16LE(8, entry + 10);
        zip[start] = 0xff;
      },
    },
    {
      name: 'incomplete directory entry counts',
      mutate: (zip: Buffer, _entry: number, end: number) => {
        const count = zip.readUInt16LE(end + 10);
        zip.writeUInt16LE(count - 1, end + 8);
        zip.writeUInt16LE(count - 1, end + 10);
      },
    },
  ])('rejects DOCX archives with $name', ({ mutate }) => {
    const invalidDocx = corruptDocxEntry(mutate);

    expect(() =>
      validateDocumentFile(makeFile('invalid.docx', DOCX_MIME, invalidDocx)),
    ).toThrow(BadRequestException);
  });

  it('rejects missing PDF EOF markers', () => {
    expect(() =>
      validateDocumentFile(
        makeFile(
          'incomplete.pdf',
          PDF_MIME,
          Buffer.from('%PDF-1.7\nincomplete'),
        ),
      ),
    ).toThrow(BadRequestException);
  });
});

describe('Direct document upload metadata validation', () => {
  const valid = {
    fileName: 'structural-plan.pdf',
    mimeType: 'application/pdf',
    fileSize: 10 * 1024 * 1024,
  };

  it('accepts valid file metadata above the legacy 4 MiB limit', () => {
    expect(validateDocumentUploadMetadata(valid)).toEqual({
      originalName: 'structural-plan.pdf',
      mimeType: 'application/pdf',
      fileSize: 10 * 1024 * 1024,
      extension: '.pdf',
      resourceType: 'raw',
    });
  });

  it('accepts files at exactly the 50 MiB limit', () => {
    expect(
      validateDocumentUploadMetadata({
        ...valid,
        fileSize: MAX_DIRECT_DOCUMENT_FILE_SIZE_BYTES,
      }),
    ).toHaveProperty('fileSize', MAX_DIRECT_DOCUMENT_FILE_SIZE_BYTES);
  });

  it('rejects files larger than 50 MiB', () => {
    expect(() =>
      validateDocumentUploadMetadata({
        ...valid,
        fileSize: MAX_DIRECT_DOCUMENT_FILE_SIZE_BYTES + 1,
      }),
    ).toThrow(PayloadTooLargeException);
  });

  it.each([0, -1, 1.5, NaN, Infinity])(
    'rejects invalid file size %s',
    (fileSize) => {
      expect(() =>
        validateDocumentUploadMetadata({
          ...valid,
          fileSize,
        }),
      ).toThrow(BadRequestException);
    },
  );

  it('rejects missing metadata', () => {
    expect(() => validateDocumentUploadMetadata(undefined)).toThrow(
      BadRequestException,
    );
  });

  it.each([
    '../drawing.pdf',
    'folder\\drawing.pdf',
    ' drawing.pdf',
    'drawing.pdf\n',
    `${'a'.repeat(252)}.pdf`,
  ])('rejects unsafe filename %s', (fileName) => {
    expect(() =>
      validateDocumentUploadMetadata({
        ...valid,
        fileName,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects unsupported file types', () => {
    expect(() =>
      validateDocumentUploadMetadata({
        ...valid,
        fileName: 'malware.exe',
        mimeType: 'application/octet-stream',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects mismatched MIME types', () => {
    expect(() =>
      validateDocumentUploadMetadata({
        ...valid,
        mimeType: 'image/png',
      }),
    ).toThrow(BadRequestException);
  });

  it('normalizes supported filename extensions', () => {
    expect(
      validateDocumentUploadMetadata({
        ...valid,
        fileName: 'DRAWING.PDF',
      }),
    ).toHaveProperty('extension', '.pdf');
  });

  it('maps image uploads to Cloudinary image resources', () => {
    expect(
      validateDocumentUploadMetadata({
        fileName: 'site.png',
        mimeType: 'image/png',
        fileSize: 2048,
      }),
    ).toHaveProperty('resourceType', 'image');
  });
});

describe('Opaque construction file validation', () => {
  const constructionFiles = [
    ['drawing.dwg', 'application/octet-stream', 'raw'],
    ['drawing.dxf', 'application/dxf', 'raw'],
    ['revit-model.rvt', 'application/octet-stream', 'raw'],
    ['revit-family.rfa', 'application/octet-stream', 'raw'],
    ['bim-model.ifc', 'application/octet-stream', 'raw'],
    ['project.max', 'application/octet-stream', 'raw'],
    ['scene.lsf', 'application/octet-stream', 'raw'],
    ['legacy-scene.ls12', 'application/octet-stream', 'raw'],
    ['model.skp', 'application/octet-stream', 'raw'],
    ['model.fbx', 'application/octet-stream', 'raw'],
    ['model.glb', 'model/gltf-binary', 'raw'],
    ['survey.las', 'application/octet-stream', 'raw'],
    ['spreadsheet.xlsx', 'application/octet-stream', 'raw'],
    ['presentation.pptx', 'application/octet-stream', 'raw'],
    ['archive.zip', 'application/zip', 'raw'],
    ['render.webp', 'image/webp', 'image'],
    ['site-image.tiff', 'image/tiff', 'image'],
  ] as const;

  it.each(constructionFiles)(
    'accepts metadata for %s',
    (fileName, mimeType, resourceType) => {
      expect(
        validateDocumentUploadMetadata({
          fileName,
          mimeType,
          fileSize: 1024,
        }),
      ).toMatchObject({
        resourceType,
        mimeType,
        fileSize: 1024,
      });
    },
  );

  it('accepts proprietary file bytes without structure parsing', () => {
    const file = makeFile(
      'project.rvt',
      'application/octet-stream',
      Buffer.from('opaque project attachment'),
    );

    expect(validateDocumentFile(file)).toMatchObject({
      extension: '.rvt',
      resourceType: 'raw',
      fileSize: file.buffer.length,
    });
  });

  it('rejects unapproved extensions', () => {
    for (const fileName of ['program.exe', 'script.js', 'shell.bat']) {
      expect(() =>
        validateDocumentUploadMetadata({
          fileName,
          mimeType: 'application/octet-stream',
          fileSize: 100,
        }),
      ).toThrow(BadRequestException);
    }
  });

  it('preserves strict PDF content validation', () => {
    expect(() =>
      validateDocumentFile(
        makeFile(
          'invalid.pdf',
          'application/pdf',
          Buffer.from('not a valid PDF'),
        ),
      ),
    ).toThrow(BadRequestException);
  });

  it('preserves the 50 MiB direct-upload limit for native project files', () => {
    expect(() =>
      validateDocumentUploadMetadata({
        fileName: 'large-model.rvt',
        mimeType: 'application/octet-stream',
        fileSize: MAX_DIRECT_DOCUMENT_FILE_SIZE_BYTES + 1,
      }),
    ).toThrow(PayloadTooLargeException);
  });
});
