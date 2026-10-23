import { validate } from 'class-validator';
import {
  CreateClientDto,
  UpdateClientDto,
} from '../../apps/client-service/src/dto/client.dto';

describe('Client DTO validation', () => {
  it('accepts a client name with an optional valid lead UUID', async () => {
    const dto = Object.assign(new CreateClientDto(), {
      fullName: 'Asha Silva',
      leadId: '00000000-0000-4000-8000-000000000001',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects missing names and malformed lead UUIDs', async () => {
    const dto = Object.assign(new CreateClientDto(), {
      fullName: '',
      leadId: 'not-a-uuid',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property).sort()).toEqual([
      'fullName',
      'leadId',
    ]);
  });

  it('allows an empty update DTO but rejects an empty provided name', async () => {
    await expect(validate(new UpdateClientDto())).resolves.toHaveLength(0);

    const dto = Object.assign(new UpdateClientDto(), { fullName: '' });
    await expect(validate(dto)).resolves.toHaveLength(1);
  });
});
