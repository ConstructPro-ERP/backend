import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { extname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { DocumentResourceType } from '../../../../libs/common/src/cloudinary/cloudinary.service';
import { ErrorCode } from '../../../../shared/error-codes';

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 4 * 1024 * 1024;
export const MAX_DOCUMENT_FILE_SIZE_MIB =
  MAX_DOCUMENT_FILE_SIZE_BYTES / (1024 * 1024);

interface DocumentTypeRule {
  mimeType: string;
  resourceType: DocumentResourceType;
}

const DOCUMENT_TYPES: Record<string, DocumentTypeRule> = {
  '.pdf': {
    mimeType: 'application/pdf',
    resourceType: 'raw',
  },
  '.png': {
    mimeType: 'image/png',
    resourceType: 'image',
  },
  '.jpg': {
    mimeType: 'image/jpeg',
    resourceType: 'image',
  },
  '.jpeg': {
    mimeType: 'image/jpeg',
    resourceType: 'image',
  },
  '.docx': {
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    resourceType: 'raw',
  },
};

export interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ValidatedDocumentFile {
  originalName: string;
  mimeType: string;
  fileSize: number;
  extension: string;
  resourceType: DocumentResourceType;
}

function invalidFile(message: string): never {
  throw new BadRequestException({
    code: ErrorCode.DOCUMENT_INVALID_FILE,
    message,
  });
}

function isPdf(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;

  const header = buffer.subarray(0, 8).toString('ascii');
  const eof = buffer.lastIndexOf(Buffer.from('%%EOF'));

  return (
    /^%PDF-[12]\.\d/.test(header) &&
    eof !== -1 &&
    eof >= Math.max(0, buffer.length - 1024)
  );
}

function isPng(buffer: Buffer): boolean {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  return (
    buffer.length >= 33 &&
    buffer.subarray(0, 8).equals(signature) &&
    buffer.readUInt32BE(8) === 13 &&
    buffer.toString('ascii', 12, 16) === 'IHDR'
  );
}

function isJpeg(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  );
}

function isDocx(buffer: Buffer): boolean {
  try {
    if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) {
      return false;
    }

    // Locate the ZIP end-of-central-directory record.
    let end = -1;
    const minimum = Math.max(0, buffer.length - 22 - 65535);

    for (let i = buffer.length - 22; i >= minimum; i--) {
      if (
        buffer.readUInt32LE(i) === 0x06054b50 &&
        i + 22 + buffer.readUInt16LE(i + 20) === buffer.length
      ) {
        end = i;
        break;
      }
    }

    if (end < 0) return false;

    const entryCount = buffer.readUInt16LE(end + 10);
    const directorySize = buffer.readUInt32LE(end + 12);
    const directoryOffset = buffer.readUInt32LE(end + 16);

    if (
      buffer.readUInt16LE(end + 4) !== 0 ||
      buffer.readUInt16LE(end + 6) !== 0 ||
      buffer.readUInt16LE(end + 8) !== entryCount ||
      entryCount === 0 ||
      entryCount > 2000 ||
      directoryOffset + directorySize > end
    ) {
      return false;
    }

    const requiredParts = new Set([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
    ]);

    const xmlParts = new Map<string, string>();
    let cursor = directoryOffset;
    let totalUncompressedSize = 0;

    for (let i = 0; i < entryCount; i++) {
      if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) {
        return false;
      }

      const flags = buffer.readUInt16LE(cursor + 8);
      const method = buffer.readUInt16LE(cursor + 10);
      const compressedSize = buffer.readUInt32LE(cursor + 20);
      const uncompressedSize = buffer.readUInt32LE(cursor + 24);
      const nameLength = buffer.readUInt16LE(cursor + 28);
      const extraLength = buffer.readUInt16LE(cursor + 30);
      const commentLength = buffer.readUInt16LE(cursor + 32);
      const localOffset = buffer.readUInt32LE(cursor + 42);
      const next = cursor + 46 + nameLength + extraLength + commentLength;

      if (
        next > directoryOffset + directorySize ||
        (flags & 1) !== 0 ||
        (method !== 0 && method !== 8) ||
        localOffset + 30 > directoryOffset
      ) {
        return false;
      }

      const name = buffer
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .toString('utf8');

      if (
        name.includes('..') ||
        name.startsWith('/') ||
        name.includes('\\') ||
        name.toLowerCase().includes('vbaproject.bin')
      ) {
        return false;
      }

      totalUncompressedSize += uncompressedSize;

      if (totalUncompressedSize > 32 * 1024 * 1024) {
        return false;
      }

      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
        return false;
      }

      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;

      const localName = buffer
        .subarray(localOffset + 30, localOffset + 30 + localNameLength)
        .toString('utf8');

      if (localName !== name || dataStart + compressedSize > directoryOffset) {
        return false;
      }

      if (requiredParts.has(name)) {
        if (uncompressedSize > 1024 * 1024) return false;

        const data = buffer.subarray(dataStart, dataStart + compressedSize);

        const decoded =
          method === 0
            ? data
            : inflateRawSync(data, { maxOutputLength: 1024 * 1024 });

        if (decoded.length !== uncompressedSize) {
          return false;
        }

        xmlParts.set(name, decoded.toString('utf8'));
      }

      cursor = next;
    }

    if (cursor !== directoryOffset + directorySize) {
      return false;
    }

    return (
      (xmlParts.get('[Content_Types].xml')?.includes('<Types') ?? false) &&
      (xmlParts.get('_rels/.rels')?.includes('<Relationships') ?? false) &&
      (xmlParts.get('word/document.xml')?.includes(':document') ?? false)
    );
  } catch {
    return false;
  }
}

export function validateDocumentFile(
  file: UploadedDocumentFile | undefined,
): ValidatedDocumentFile {
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    typeof file.originalname !== 'string' ||
    typeof file.mimetype !== 'string' ||
    typeof file.size !== 'number'
  ) {
    return invalidFile('A valid document file is required.');
  }

  if (file.buffer.length === 0 || file.size !== file.buffer.length) {
    return invalidFile('Document is empty or has an invalid size.');
  }

  if (file.buffer.length > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    throw new PayloadTooLargeException({
      code: ErrorCode.DOCUMENT_FILE_TOO_LARGE,
      message: `Document exceeds the ${MAX_DOCUMENT_FILE_SIZE_MIB} MiB upload limit.`,
    });
  }

  const name = file.originalname;

  if (
    name.length === 0 ||
    name.length > 255 ||
    name !== name.trim() ||
    name.includes('/') ||
    name.includes('\\') ||
    [...name].some((char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    return invalidFile('Document filename is invalid.');
  }

  const extension = extname(name).toLowerCase();
  const rule = DOCUMENT_TYPES[extension];

  if (!rule || file.mimetype !== rule.mimeType) {
    return invalidFile('Unsupported or mismatched document file type.');
  }

  const validContent =
    extension === '.pdf'
      ? isPdf(file.buffer)
      : extension === '.png'
        ? isPng(file.buffer)
        : extension === '.jpg' || extension === '.jpeg'
          ? isJpeg(file.buffer)
          : isDocx(file.buffer);

  if (!validContent) {
    return invalidFile('Document content does not match its file type.');
  }

  return {
    originalName: name,
    mimeType: rule.mimeType,
    fileSize: file.buffer.length,
    extension,
    resourceType: rule.resourceType,
  };
}
