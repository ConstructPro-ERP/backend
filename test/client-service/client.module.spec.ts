import { MODULE_METADATA } from '@nestjs/common/constants';
import { ClientModule } from '../../apps/client-service/src/client.module';
import { ClientController } from '../../apps/client-service/src/client.controller';
import { ClientPortalController } from '../../apps/client-service/src/client-portal.controller';
import { ClientService } from '../../apps/client-service/src/client.service';
import { ClientPortalAccessService } from '../../apps/client-service/src/client-portal-access.service';
import { ClientPortalReadService } from '../../apps/client-service/src/client-portal-read.service';
import { ClientRepository } from '../../apps/client-service/src/repository/client.repository';
import { PrismaService } from '../../prisma/prisma.service';

describe('ClientModule', () => {
  it('registers its controllers and required providers', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      ClientModule,
    ) as unknown[];

    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ClientModule,
    ) as unknown[];

    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ClientModule,
    ) as unknown[];

    expect(controllers).toEqual([ClientController, ClientPortalController]);

    expect(providers).toEqual([
      ClientService,
      ClientPortalAccessService,
      ClientPortalReadService,
      ClientRepository,
      PrismaService,
    ]);

    expect(imports).toHaveLength(1);
  });
});
