import {
  CallHandler,
  ExecutionContext,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ErrorCode } from '../../../../shared/error-codes';
import {
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_DOCUMENT_FILE_SIZE_MIB,
} from '../validation/document-file.validator';

const BaseFileInterceptor = FileInterceptor('file', {
  limits: {
    fileSize: MAX_DOCUMENT_FILE_SIZE_BYTES,
    files: 1,
  },
});

@Injectable()
export class DocumentFileInterceptor extends BaseFileInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (error: unknown) {
      if (error instanceof PayloadTooLargeException) {
        throw new PayloadTooLargeException({
          code: ErrorCode.DOCUMENT_FILE_TOO_LARGE,
          message: `Document exceeds the ${MAX_DOCUMENT_FILE_SIZE_MIB} MiB upload limit.`,
        });
      }

      throw error;
    }
  }
}
