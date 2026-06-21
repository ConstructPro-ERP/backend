import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import * as zod from 'zod';
import { ErrorCode } from '../../../../shared/error-codes';

// Generic pipe that validates any Zod schema and surfaces readable field errors
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: zod.ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // Flatten issues to ["fieldName: message"] strings matching class-validator format
      const details = result.error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`,
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
