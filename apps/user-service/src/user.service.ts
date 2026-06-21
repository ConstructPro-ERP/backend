import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  // Strip password from every outbound user object
  private safe<T extends { password?: string | null }>(user: T) {
    const { password: _, ...rest } = user;
    return rest;
  }

  findAll() {
    return this.prisma.user
      .findMany({ orderBy: { createdAt: 'desc' } })
      .then((users) => users.map(this.safe));
  }

  findById(id: string) {
    return this.prisma.user
      .findUnique({ where: { id } })
      .then((u) => (u ? this.safe(u) : null));
  }

  async create(dto: CreateUserDto) {
    const hashed = dto.password ? await bcrypt.hash(dto.password, 10) : null;
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        password: hashed,
        roleId: dto.roleId,
        avatar: dto.avatar,
        status: 'ACTIVE',
      },
    });
    return this.safe(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.assertExists(id);
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return this.safe(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    await this.assertExists(id);
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return this.safe(user);
  }

  async remove(id: string) {
    await this.assertExists(id);
    // Soft-delete: mark INACTIVE rather than destroying data
    await this.prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
  }

  // Throws 404 early so callers don't get cryptic Prisma errors
  private async assertExists(id: string) {
    const count = await this.prisma.user.count({ where: { id } });
    if (!count) throw new NotFoundException(`User ${id} not found`);
  }
}
