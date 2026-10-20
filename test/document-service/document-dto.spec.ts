import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UploadDocumentDto } from '../../apps/document-service/src/dto/upload-document.dto';
import {
  DocumentQueryDto,
  DocumentSortField,
  DocumentSortOrder,
} from '../../apps/document-service/src/dto/document-query.dto';
import { CreateDocumentCategoryDto } from '../../apps/document-service/src/dto/create-document-category.dto';
import { UpdateDocumentCategoryDto } from '../../apps/document-service/src/dto/update-document-category.dto';
import { AuthorizeDocumentUploadDto } from '../../apps/document-service/src/dto/authorize-document-upload.dto';

const categoryId = 'b390c2c8-86f5-484f-ad9f-170bca22703d';

function errors<T extends object>(
  dtoClass: new () => T,
  payload: Record<string, unknown>,
): string[] {
  return validateSync(plainToInstance(dtoClass, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((error) => error.property);
}

describe('Document DTO validation', () => {
  describe('UploadDocumentDto', () => {
    it('accepts a valid upload request', () => {
      expect(
        errors(UploadDocumentDto, {
          categoryId,
          description: 'Approved contract',
        }),
      ).toEqual([]);
    });

    it('rejects invalid and missing category IDs', () => {
      expect(errors(UploadDocumentDto, {})).toContain('categoryId');
      expect(errors(UploadDocumentDto, { categoryId: 'invalid' })).toContain(
        'categoryId',
      );
    });

    it('rejects blank or oversized descriptions', () => {
      expect(
        errors(UploadDocumentDto, {
          categoryId,
          description: ' ',
        }),
      ).toContain('description');

      expect(
        errors(UploadDocumentDto, {
          categoryId,
          description: 'A'.repeat(1001),
        }),
      ).toContain('description');
    });

    it('rejects server-controlled fields', () => {
      expect(
        errors(UploadDocumentDto, {
          categoryId,
          projectId: categoryId,
          uploadedById: categoryId,
          cloudinaryPublicId: 'forged',
          storageStatus: 'ACTIVE',
        }),
      ).toEqual(
        expect.arrayContaining([
          'projectId',
          'uploadedById',
          'cloudinaryPublicId',
          'storageStatus',
        ]),
      );
    });
  });

  describe('AuthorizeDocumentUploadDto', () => {
    const valid = {
      categoryId,
      fileName: 'structural-plan.pdf',
      mimeType: 'application/pdf',
      fileSize: 10485760,
      description: 'Approved structural drawing',
    };

    it('accepts valid authorization metadata', () => {
      expect(errors(AuthorizeDocumentUploadDto, valid)).toEqual([]);
    });

    it('accepts optional descriptions', () => {
      const withoutDescription = {
        categoryId: valid.categoryId,
        fileName: valid.fileName,
        mimeType: valid.mimeType,
        fileSize: valid.fileSize,
      };

      expect(errors(AuthorizeDocumentUploadDto, withoutDescription)).toEqual(
        [],
      );

      expect(
        errors(AuthorizeDocumentUploadDto, {
          ...withoutDescription,
          description: null,
        }),
      ).toEqual([]);
    });

    it('rejects missing required metadata', () => {
      expect(errors(AuthorizeDocumentUploadDto, {})).toEqual(
        expect.arrayContaining([
          'categoryId',
          'fileName',
          'mimeType',
          'fileSize',
        ]),
      );
    });

    it('rejects invalid filenames and MIME types', () => {
      expect(
        errors(AuthorizeDocumentUploadDto, {
          ...valid,
          fileName: ' ',
          mimeType: '',
        }),
      ).toEqual(expect.arrayContaining(['fileName', 'mimeType']));
    });

    it('rejects invalid file sizes', () => {
      for (const fileSize of [0, -1, 1.5, '10485760']) {
        expect(
          errors(AuthorizeDocumentUploadDto, {
            ...valid,
            fileSize,
          }),
        ).toContain('fileSize');
      }
    });

    it('rejects unsupported client-controlled storage fields', () => {
      expect(
        errors(AuthorizeDocumentUploadDto, {
          ...valid,
          uploadedById: categoryId,
          cloudinaryPublicId: 'forged',
          storageStatus: 'ACTIVE',
        }),
      ).toEqual(
        expect.arrayContaining([
          'uploadedById',
          'cloudinaryPublicId',
          'storageStatus',
        ]),
      );
    });

    it('inherits the existing category and description validation', () => {
      expect(
        errors(AuthorizeDocumentUploadDto, {
          ...valid,
          categoryId: 'invalid',
          description: ' ',
        }),
      ).toEqual(expect.arrayContaining(['categoryId', 'description']));
    });
  });

  describe('DocumentQueryDto', () => {
    it('accepts filters, pagination and sorting', () => {
      expect(
        errors(DocumentQueryDto, {
          categoryId,
          search: 'drawing',
          page: '2',
          limit: '20',
          sortBy: DocumentSortField.FILE_NAME,
          sortOrder: DocumentSortOrder.ASC,
        }),
      ).toEqual([]);
    });

    it('uses the correct defaults', () => {
      const dto = plainToInstance(DocumentQueryDto, {});

      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(10);
      expect(dto.sortBy).toBe(DocumentSortField.CREATED_AT);
      expect(dto.sortOrder).toBe(DocumentSortOrder.DESC);
    });

    it('rejects invalid pagination and filters', () => {
      expect(
        errors(DocumentQueryDto, {
          categoryId: 'invalid',
          search: ' ',
          page: '0',
          limit: '101',
          sortBy: 'invalid',
          sortOrder: 'invalid',
        }),
      ).toEqual(
        expect.arrayContaining([
          'categoryId',
          'search',
          'page',
          'limit',
          'sortBy',
          'sortOrder',
        ]),
      );
    });
  });

  describe('DocumentCategory DTOs', () => {
    it('accepts category creation', () => {
      expect(
        errors(CreateDocumentCategoryDto, {
          categoryName: 'Contracts',
          description: 'Signed agreements',
        }),
      ).toEqual([]);
    });

    it('rejects blank or missing category names', () => {
      expect(errors(CreateDocumentCategoryDto, {})).toContain('categoryName');

      expect(
        errors(CreateDocumentCategoryDto, {
          categoryName: '   ',
        }),
      ).toContain('categoryName');
    });

    it('accepts category updates and deactivation', () => {
      expect(
        errors(UpdateDocumentCategoryDto, {
          categoryName: 'Updated Contracts',
          isActive: false,
          description: null,
        }),
      ).toEqual([]);
    });

    it('rejects invalid activation values', () => {
      expect(
        errors(UpdateDocumentCategoryDto, {
          isActive: 'false',
        }),
      ).toContain('isActive');

      expect(
        errors(UpdateDocumentCategoryDto, {
          isActive: null,
        }),
      ).toContain('isActive');
    });
  });
});
