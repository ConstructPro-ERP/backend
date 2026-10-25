import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedToken {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

@Injectable()
export class TokenEncryptionService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const encodedKey = this.configService.getOrThrow<string>(
      'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY',
    );

    const key = Buffer.from(encodedKey, 'base64');

    if (key.length !== 32) {
      throw new Error(
        'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.',
      );
    }

    this.key = key;
  }

  encrypt(value: string): EncryptedToken {
    const iv = randomBytes(12);

    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);

    return {
      encryptedValue: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(encryptedValue: string, iv: string, authTag: string): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
