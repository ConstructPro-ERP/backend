import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { ClientRepository } from './repository/client.repository';

@Injectable()
export class ClientService {
  constructor(private readonly clients: ClientRepository) {}

  async create(dto: CreateClientDto) {
    if (dto.leadId) {
      const existing = await this.clients.findByLeadId(dto.leadId);
      if (existing) {
        throw new ConflictException(
          `A client is already linked to lead ${dto.leadId}.`,
        );
      }
    }
    return this.clients.create({ fullName: dto.fullName, leadId: dto.leadId });
  }

  findAll() {
    return this.clients.findAll();
  }

  async findOne(id: string) {
    return this.ensureClientExists(id);
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.ensureClientExists(id);
    return this.clients.update(id, dto);
  }

  async remove(id: string) {
    await this.ensureClientExists(id);
    await this.clients.delete(id);
  }

  async linkPortalUser(customerId: string, userId: string) {
    const customer = await this.clients.findById(customerId);

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    if (!customer.leadId) {
      throw new ConflictException(
        'Customer must be linked to a Lead before portal access is enabled.',
      );
    }

    const user = await this.clients.findPortalUserCandidate(userId);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (
      user.status !== UserStatus.ACTIVE ||
      user.role?.roleName !== 'CLIENT_PORTAL_USER'
    ) {
      throw new BadRequestException(
        'User must be active and have the CLIENT_PORTAL_USER role.',
      );
    }

    // Repeating an existing valid link is safe.
    if (customer.userId === userId) {
      return { customerId, userId };
    }

    if (customer.userId !== null) {
      throw new ConflictException(
        'Customer is already linked to another User.',
      );
    }

    if (user.customer) {
      throw new ConflictException(
        'User is already linked to another Customer.',
      );
    }

    try {
      const result = await this.clients.linkPortalUserIfUnlinked(
        customerId,
        userId,
      );

      if (result.count !== 1) {
        throw new ConflictException(
          'Customer portal association changed. Please retry.',
        );
      }
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'User is already linked to another Customer.',
        );
      }

      throw error;
    }

    return { customerId, userId };
  }

  private async ensureClientExists(id: string) {
    const client = await this.clients.findById(id);
    if (!client) throw new NotFoundException(`Client ${id} not found.`);
    return client;
  }
}
