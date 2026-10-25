import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception.js';

export class ValidationException extends AppException {
  constructor(message: string) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
