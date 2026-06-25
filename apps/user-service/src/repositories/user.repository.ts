import { Injectable } from '@nestjs/common';
import { Prisma, UserStatus, type Role } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  USER_WITH_ROLE_INCLUDE,
  type UserWithRole,
} from '../entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<UserWithRole[]> {
    return this.prisma.user.findMany({
      include: USER_WITH_ROLE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<UserWithRole | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: USER_WITH_ROLE_INCLUDE,
    });
  }

  findByEmail(email: string): Promise<UserWithRole | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: USER_WITH_ROLE_INCLUDE,
    });
  }

  findRoleById(id: string): Promise<Role | null> {
    return this.prisma.role.findUnique({
      where: { id },
    });
  }

  findRoleByName(roleName: string): Promise<Role | null> {
    return this.prisma.role.findUnique({
      where: { roleName },
    });
  }

  create(data: Prisma.UserCreateInput): Promise<UserWithRole> {
    return this.prisma.user.create({
      data,
      include: USER_WITH_ROLE_INCLUDE,
    });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<UserWithRole> {
    return this.prisma.user.update({
      where: { id },
      data,
      include: USER_WITH_ROLE_INCLUDE,
    });
  }

  deactivate(id: string): Promise<UserWithRole> {
    return this.update(id, { status: UserStatus.INACTIVE });
  }

  existsById(id: string): Promise<boolean> {
    return this.prisma.user.count({ where: { id } }).then((count) => count > 0);
  }
}
