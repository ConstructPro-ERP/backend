import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateClientDto,
  UpdateClientDto,
} from '../../apps/client-service/src/dto/client.dto';
import { ClientPortalPageQueryDto } from '../../apps/client-service/src/dto/client-portal-page-query.dto';
import { LinkClientPortalUserDto } from '../../apps/client-service/src/dto/link-client-portal-user.dto';

const validId = 'b390c2c8-86f5-484f-ad9f-170bca22703d';

function errors<T extends object>(
  dtoClass: new () => T,
  payload: Record<string, unknown>,
): string[] {
  return validateSync(plainToInstance(dtoClass, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((error) => error.property);
}

describe('Client DTO validation', () => {
  describe('CreateClientDto', () => {
    it('accepts a valid Customer', () => {
      expect(
        errors(CreateClientDto, {
          fullName: 'Test Customer',
          leadId: validId,
        }),
      ).toEqual([]);
    });

    it('accepts a Customer without a Lead', () => {
      expect(
        errors(CreateClientDto, {
          fullName: 'Test Customer',
        }),
      ).toEqual([]);
    });

    it('rejects missing or blank Customer names', () => {
      expect(errors(CreateClientDto, {})).toContain('fullName');
      expect(errors(CreateClientDto, { fullName: '' })).toContain('fullName');
    });

    it('rejects invalid Lead identifiers', () => {
      expect(
        errors(CreateClientDto, {
          fullName: 'Test Customer',
          leadId: 'invalid',
        }),
      ).toContain('leadId');
    });
  });

  describe('UpdateClientDto', () => {
    it('accepts an empty update', () => {
      expect(errors(UpdateClientDto, {})).toEqual([]);
    });

    it('accepts a valid new name', () => {
      expect(errors(UpdateClientDto, { fullName: 'Updated Customer' })).toEqual(
        [],
      );
    });

    it('rejects a blank Customer name', () => {
      expect(errors(UpdateClientDto, { fullName: '' })).toContain('fullName');
    });
  });

  describe('LinkClientPortalUserDto', () => {
    it('accepts a valid User UUID', () => {
      expect(errors(LinkClientPortalUserDto, { userId: validId })).toEqual([]);
    });

    it('rejects missing or invalid User identifiers', () => {
      expect(errors(LinkClientPortalUserDto, {})).toContain('userId');

      expect(errors(LinkClientPortalUserDto, { userId: 'invalid' })).toContain(
        'userId',
      );
    });
  });

  describe('ClientPortalPageQueryDto', () => {
    it('applies default page and limit values', () => {
      const query = plainToInstance(ClientPortalPageQueryDto, {});

      expect(query.page).toBe(1);
      expect(query.limit).toBe(10);
      expect(validateSync(query)).toEqual([]);
    });

    it('transforms valid pagination strings into numbers', () => {
      const query = plainToInstance(ClientPortalPageQueryDto, {
        page: '2',
        limit: '5',
      });

      expect(query.page).toBe(2);
      expect(query.limit).toBe(5);
      expect(validateSync(query)).toEqual([]);
    });

    it('rejects invalid pagination limits', () => {
      expect(
        errors(ClientPortalPageQueryDto, {
          page: 0,
          limit: 101,
        }),
      ).toEqual(expect.arrayContaining(['page', 'limit']));
    });

    it('rejects nonnumeric pagination values', () => {
      expect(
        errors(ClientPortalPageQueryDto, {
          page: 'abc',
        }),
      ).toContain('page');
    });
  });
});
