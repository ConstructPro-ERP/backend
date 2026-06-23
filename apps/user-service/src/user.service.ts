import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserStatus } from '@prisma/client';
import { UserRepository } from './repositories/user.repository';
import { toSafeUser, toSafeUsers, type SafeUser } from './entities/user.entity';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';

const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async findAll(): Promise<SafeUser[]> {
    const users = await this.userRepository.findAll();
    return toSafeUsers(users);
  }

  async findById(id: string): Promise<SafeUser | null> {
    const user = await this.userRepository.findById(id);
    return user ? toSafeUser(user) : null;
  }

  async create(dto: CreateUserDto): Promise<SafeUser> {
    const hashedPassword = dto.password
      ? await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS)
      : null;

    const user = await this.userRepository.create({
      fullName: dto.fullName,
      email: dto.email,
      password: hashedPassword,
      role: { connect: { id: dto.roleId } },
      status: UserStatus.ACTIVE,
    });

    return toSafeUser(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    await this.assertExists(id);
    const user = await this.userRepository.update(id, dto);
    return toSafeUser(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<SafeUser> {
    await this.assertExists(id);
    const user = await this.userRepository.update(id, dto);
    return toSafeUser(user);
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    await this.userRepository.deactivate(id);
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.userRepository.existsById(id);
    if (!exists) {
      throw new NotFoundException(`User ${id} not found`);
    }
  }
}
