import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../shared/error-codes';

export interface ClientPortalIdentity {
  userId: string;
  customerId: string;
}

@Injectable()
export class ClientPortalAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveClient(actorId?: string): Promise<ClientPortalIdentity> {
    if (!actorId) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_MISSING,
        message: 'Authentication is required.',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: {
        id: true,
        status: true,
        role: {
          select: { roleName: true },
        },
        customer: {
          select: { id: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Authenticated user was not found.',
      });
    }

    if (
      user.status !== UserStatus.ACTIVE ||
      user.role?.roleName !== 'CLIENT_PORTAL_USER'
    ) {
      throw new ForbiddenException({
        code: ErrorCode.CLIENT_PORTAL_ACCESS_DENIED,
        message: 'Client portal access is not permitted.',
      });
    }

    if (!user.customer) {
      throw new ForbiddenException({
        code: ErrorCode.CLIENT_PROFILE_NOT_LINKED,
        message: 'No customer profile is linked to this account.',
      });
    }

    return {
      userId: user.id,
      customerId: user.customer.id,
    };
  }

  // A project is client-visible only when at least one quotation
  // belongs to the customer and no attached quotation belongs elsewhere.
  ownedProjectWhere(customerId: string): Prisma.ProjectWhereInput {
    return {
      quotations: {
        some: {
          lead: {
            customer: {
              is: { id: customerId },
            },
          },
        },
        every: {
          lead: {
            customer: {
              is: { id: customerId },
            },
          },
        },
      },
    };
  }

  async assertOwnProject(
    projectId: string,
    identity: ClientPortalIdentity,
  ): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        ...this.ownedProjectWhere(identity.customerId),
      },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException({
        code: ErrorCode.PROJECT_NOT_FOUND,
        message: 'Project not found.',
      });
    }
  }
}
