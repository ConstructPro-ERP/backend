import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import {
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  validateDocumentFile,
  type UploadedDocumentFile,
} from '../../apps/document-service/src/validation/document-file.validator';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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
