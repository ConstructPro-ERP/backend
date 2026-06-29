import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import {
  CreateLeadContactDto,
  UpdateLeadContactDto,
} from './dto/lead-contact.dto';
import { ListLeadsQueryDto } from './dto/list-lead-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadRepository } from './repository/lead.repository';

@Injectable()
export class LeadService {
  constructor(private readonly leads: LeadRepository) {}

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async create(dto: CreateLeadDto) {
    if (dto.assignedToId) {
      await this.ensureUserExists(dto.assignedToId);
    }
    return this.leads.create({
      customerName: dto.customerName,
      phone: dto.phone,
      email: dto.email,
      assignedToId: dto.assignedToId,
      status: dto.status,
    });
  }

  async findAll(query: ListLeadsQueryDto) {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.LeadWhereInput = {
      status: query.status,
      assignedToId: query.assignedToId,
      ...(query.search
        ? {
            OR: [
              {
                customerName: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                phone: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                email: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.LeadOrderByWithRelationInput = {
      [query.sortBy]: query.sortOrder,
    };

    const [data, total] = await this.leads.findManyAndCount({
      where,
      skip,
      take: query.limit,
      orderBy,
    });

    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    return this.ensureLeadExists(id);
  }

  async update(id: string, dto: UpdateLeadDto) {
    await this.ensureLeadExists(id);
    if (dto.assignedToId) {
      await this.ensureUserExists(dto.assignedToId);
    }
    return this.leads.update(id, dto);
  }

  async remove(id: string) {
    await this.ensureLeadExists(id);
    await this.leads.delete(id);
  }

  async assign(id: string, assignedToId: string) {
    await this.ensureLeadExists(id);
    await this.ensureUserExists(assignedToId);
    return this.leads.update(id, { assignedToId });
  }

  async updateStatus(id: string, status: string) {
    await this.ensureLeadExists(id);
    return this.leads.update(id, { status: status as any });
  }

  // ── Notes ─────────────────────────────────────────────────────────────────────

  async addNote(leadId: string, dto: CreateLeadNoteDto, actorId?: string) {
    await this.ensureLeadExists(leadId);

    // If the API gateway sends the logged-in user ID, make sure it exists
    // before saving it as the note author.
    if (actorId) {
      await this.ensureUserExists(actorId);
    }

    return this.leads.createNote({
      leadId,
      content: dto.content,
      authorId: actorId,
    });
  }

  async getNotes(leadId: string) {
    await this.ensureLeadExists(leadId);
    return this.leads.findNotes(leadId);
  }

  async deleteNote(leadId: string, noteId: string) {
    await this.ensureLeadExists(leadId);
    try {
      await this.leads.deleteNote(noteId);
    } catch {
      throw new NotFoundException(`Note ${noteId} not found.`);
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────────

  async addContact(leadId: string, dto: CreateLeadContactDto) {
    await this.ensureLeadExists(leadId);
    return this.leads.createContact({
      leadId,
      label: dto.label,
      value: dto.value,
    });
  }

  async updateContact(
    leadId: string,
    contactId: string,
    dto: UpdateLeadContactDto,
  ) {
    await this.ensureLeadExists(leadId);
    try {
      return await this.leads.updateContact(contactId, {
        label: dto.label,
        value: dto.value,
      });
    } catch {
      throw new NotFoundException(`Contact ${contactId} not found.`);
    }
  }

  async deleteContact(leadId: string, contactId: string) {
    await this.ensureLeadExists(leadId);
    try {
      await this.leads.deleteContact(contactId);
    } catch {
      throw new NotFoundException(`Contact ${contactId} not found.`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private async ensureLeadExists(id: string) {
    const lead = await this.leads.findById(id);
    if (!lead) throw new NotFoundException(`Lead ${id} not found.`);
    return lead;
  }

  private async ensureUserExists(userId: string) {
    const user = await this.leads.findUser(userId);
    if (!user) {
      throw new BadRequestException(`User ${userId} does not exist.`);
    }
    return user;
  }
}
