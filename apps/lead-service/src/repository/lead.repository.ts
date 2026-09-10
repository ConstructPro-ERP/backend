import { Injectable } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const leadInclude = Prisma.validator<Prisma.LeadInclude>()({
  assignedTo: {
    select: { id: true, fullName: true, email: true },
  },
  notes: {
    orderBy: { createdAt: 'desc' },
  },
  contacts: true,
  customer: {
    select: { id: true, fullName: true },
  },
});

export type LeadWithDetails = Prisma.LeadGetPayload<{
  include: typeof leadInclude;
}>;

@Injectable()
export class LeadRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    customerName: string;
    phone?: string;
    email?: string;
    assignedToId?: string;
    status?: LeadStatus;
  }) {
    return this.prisma.lead.create({ data, include: leadInclude });
  }

  async findManyAndCount(args: {
    where: Prisma.LeadWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.LeadOrderByWithRelationInput;
  }): Promise<[LeadWithDetails[], number]> {
    return this.prisma.$transaction([
      this.prisma.lead.findMany({ ...args, include: leadInclude }),
      this.prisma.lead.count({ where: args.where }),
    ]);
  }

  findById(id: string) {
    return this.prisma.lead.findUnique({ where: { id }, include: leadInclude });
  }

  update(
    id: string,
    data: {
      customerName?: string;
      phone?: string;
      email?: string;
      assignedToId?: string;
      status?: LeadStatus;
    },
  ) {
    return this.prisma.lead.update({
      where: { id },
      data,
      include: leadInclude,
    });
  }

  delete(id: string) {
    return this.prisma.lead.delete({ where: { id } });
  }

  findUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  // ── Notes ────────────────────────────────────────────────────────────────────

  createNote(data: { leadId: string; content: string; authorId?: string }) {
    return this.prisma.leadNote.create({ data });
  }

  findNotes(leadId: string) {
    return this.prisma.leadNote.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
  }

  deleteNote(noteId: string) {
    return this.prisma.leadNote.delete({ where: { id: noteId } });
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────

  createContact(data: { leadId: string; label: string; value: string }) {
    return this.prisma.leadContact.create({ data });
  }

  updateContact(contactId: string, data: { label: string; value: string }) {
    return this.prisma.leadContact.update({ where: { id: contactId }, data });
  }

  deleteContact(contactId: string) {
    return this.prisma.leadContact.delete({ where: { id: contactId } });
  }
}
