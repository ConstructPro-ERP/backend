import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { ErrorCode } from '../../../../shared/error-codes';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed.',
        details,
      });
    }
    return result.data;
  }
}
