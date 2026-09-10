import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  private async ensureClientExists(id: string) {
    const client = await this.clients.findById(id);
    if (!client) throw new NotFoundException(`Client ${id} not found.`);
    return client;
  }
}
