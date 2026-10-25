import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class ClientRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { fullName: string; leadId?: string }) {
    return this.prisma.customer.create({ data });
  }

  findAll() {
    return this.prisma.customer.findMany({ orderBy: { fullName: 'asc' } });
  }

  findById(id: string) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: {
        lead: {
          select: { id: true, status: true, customerName: true },
        },
      },
    });
  }

  findByLeadId(leadId: string) {
    return this.prisma.customer.findUnique({ where: { leadId } });
  }

  findPortalUserCandidate(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
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
  }

  linkPortalUserIfUnlinked(customerId: string, userId: string) {
    return this.prisma.customer.updateMany({
      where: {
        id: customerId,
        userId: null,
        leadId: { not: null },
      },
      data: { userId },
    });
  }

  update(id: string, data: { fullName?: string }) {
    return this.prisma.customer.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.customer.delete({ where: { id } });
  }
}
