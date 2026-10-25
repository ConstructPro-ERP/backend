import { ConfigService } from '@nestjs/config';
import { TokenEncryptionService } from '../../apps/calender-service/src/token-encryption.service';
import { createFixture } from './fixtures';

describe('TokenEncryptionService', () => {
  it('round-trips tokens using a fresh IV for every encryption', () => {
    const { encryption } = createFixture();
    const first = encryption.encrypt('refresh-token');
    const second = encryption.encrypt('refresh-token');
    expect(first.iv).not.toBe(second.iv);
    expect(first.encryptedValue).not.toBe(second.encryptedValue);
    expect(
      encryption.decrypt(first.encryptedValue, first.iv, first.authTag),
    ).toBe('refresh-token');
  });

  it.each(['encryptedValue', 'iv', 'authTag'] as const)(
    'rejects tampered %s',
    (field) => {
      const { encryption } = createFixture();
      const token = encryption.encrypt('refresh-token');
      const bytes = Buffer.from(token[field], 'base64');
      bytes[0] ^= 1;
      token[field] = bytes.toString('base64');
      expect(() =>
        encryption.decrypt(token.encryptedValue, token.iv, token.authTag),
      ).toThrow();
    },
  );

  it('rejects keys that are not 32 bytes', () => {
    expect(
      () =>
        new TokenEncryptionService(
          new ConfigService({
            GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY:
              Buffer.alloc(16).toString('base64'),
          }),
        ),
    ).toThrow('exactly 32 bytes');
  });
});
