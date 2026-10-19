import { BadRequestException } from '@nestjs/common';
import { CreateUserSchema } from '../../apps/user-service/src/dto/create-user.dto';
import { UpdateUserSchema } from '../../apps/user-service/src/dto/update-user.dto';
import { UpdateProfileSchema } from '../../apps/user-service/src/dto/update-profile.dto';
import { ZodValidationPipe } from '../../apps/user-service/src/pipes/zod-validation.pipe';
import { ErrorCode } from '../../shared/error-codes';

describe('User management request validation', () => {
  const validUser = { fullName: 'Alex Smith', email: 'alex@example.com' };

  it('accepts passwordless creation without a role', () => {
    expect(
      new ZodValidationPipe(CreateUserSchema).transform(validUser),
    ).toEqual(validUser);
  });

  it.each([
    { fullName: '' },
    { email: 'invalid' },
    { password: '12345' },
    { roleId: '' },
  ])('rejects invalid creation fields: %j', (fields) => {
    expect(() =>
      new ZodValidationPipe(CreateUserSchema).transform({
        ...validUser,
        ...fields,
      }),
    ).toThrow(BadRequestException);
  });

  it('returns structured validation errors identifying the invalid field', () => {
    try {
      new ZodValidationPipe(CreateUserSchema).transform({
        ...validUser,
        email: 'invalid',
      });
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed.',
        details: [expect.stringContaining('email:')],
      });
    }
  });

  it('accepts partial administrative updates', () => {
    expect(
      new ZodValidationPipe(UpdateUserSchema).transform({ status: 'INACTIVE' }),
    ).toEqual({ status: 'INACTIVE' });
  });

  it.each([
    { status: 'DELETED' },
    { email: 'invalid' },
    { roleId: '' },
    { fullName: '' },
  ])('rejects invalid updates: %j', (fields) => {
    expect(() =>
      new ZodValidationPipe(UpdateUserSchema).transform(fields),
    ).toThrow(BadRequestException);
  });

  it('strips privileged fields from profile updates', () => {
    expect(
      new ZodValidationPipe(UpdateProfileSchema).transform({
        fullName: 'New Name',
        roleId: 'admin-role',
        status: 'ACTIVE',
        email: 'other@example.com',
        password: 'replacement',
      }),
    ).toEqual({ fullName: 'New Name' });
  });

  it('rejects an empty profile name', () => {
    expect(() =>
      new ZodValidationPipe(UpdateProfileSchema).transform({ fullName: '' }),
    ).toThrow(BadRequestException);
  });
});
