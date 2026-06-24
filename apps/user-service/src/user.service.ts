import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, UserStatus } from '@prisma/client';
import { ErrorCode } from '../../../shared/error-codes';
import { UserRepository } from './repositories/user.repository';
import {
  toSafeUser,
  toSafeUsers,
  type SafeUser,
  UserWithRole,
} from './entities/user.entity';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { prisma } from '../../../libs/database/src';

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
    /*
     * User creation is now separated from role assignment.
     *
     * Normal email/password users may still send roleId or roleName.
     * Google users or invited users can be created without a role.
     */
    const roleConnect = await this.resolveOptionalRoleConnect(dto);

    const hashedPassword = dto.password
      ? await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS)
      : null;

    // Check whether a user already exists with the same email.
    const existingUser = await this.userRepository.findByEmail(dto.email);

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    const user = await this.userRepository.create({
      fullName: dto.fullName,
      email: dto.email,
      password: hashedPassword,
      status: UserStatus.ACTIVE,

      /*
       * Only connect a role when the request contains a valid roleId or roleName.
       * If no role is provided, Prisma will create the user with roleId = null.
       */
      ...(roleConnect
        ? {
            role: roleConnect,
          }
        : {}),
    });

    return toSafeUser(user);
  }
  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    await this.assertExists(id);

    const updateData: Prisma.UserUpdateInput = {};

    if (dto.fullName !== undefined) {
      updateData.fullName = dto.fullName;
    }

    if (dto.email !== undefined) {
      const existingUser = await this.userRepository.findByEmail(dto.email);

      if (existingUser && existingUser.id !== id) {
        throw new BadRequestException('Email is already used by another user');
      }

      updateData.email = dto.email;
    }

    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }

    if (dto.roleId !== undefined) {
      const role = await this.userRepository.findRoleById(dto.roleId);

      if (!role) {
        throw new BadRequestException({
          code: ErrorCode.ROLE_NOT_FOUND,
          message: `Role ${dto.roleId} does not exist.`,
        });
      }

      updateData.role = {
        connect: {
          id: role.id,
        },
      };
    }

    const user = await this.userRepository.update(id, updateData);
    return toSafeUser(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<SafeUser> {
    await this.assertExists(id);
    const user = await this.userRepository.update(id, dto);
    return toSafeUser(user);
  }

  async remove(id: string): Promise<UserWithRole | null> {
    await this.assertExists(id);
    const deletedUser = await this.userRepository.findById(id);

    await this.userRepository.deactivate(id);
    return deletedUser;
  }

  private async resolveOptionalRoleConnect(
    dto: CreateUserDto,
  ): Promise<Prisma.UserCreateInput['role'] | undefined> {
    /*
     * Preferred frontend request:
     * { "roleName": "ADMIN" }
     */
    if (dto.roleId) {
      const role = await this.userRepository.findRoleById(dto.roleId);

      if (!role) {
        throw new BadRequestException({
          code: ErrorCode.ROLE_NOT_FOUND,
          message: `Role ${dto.roleId} does not exist.`,
        });
      }

      return {
        connect: {
          id: role.id,
        },
      };
    }

    /*
     * Backward-compatible request:
     * { "roleId": "real-role-uuid" }
     *
     * If someone accidentally sends roleId: "ADMIN", this fallback will also
     * try to resolve it as a role name instead of allowing Prisma to crash.
     */
    if (dto.roleId) {
      const roleById = await this.userRepository.findRoleById(dto.roleId);

      if (roleById) {
        return {
          connect: {
            id: roleById.id,
          },
        };
      }

      const normalizedRoleName = normalizeRole(dto.roleId);
      const roleByName =
        await this.userRepository.findRoleByName(normalizedRoleName);

      if (roleByName) {
        return {
          connect: {
            id: roleByName.id,
          },
        };
      }

      throw new BadRequestException({
        code: ErrorCode.ROLE_NOT_FOUND,
        message:
          'Role does not exist. Send a valid roleId UUID or roleName such as ADMIN.',
      });
    }

    /*
     * No roleId or roleName was provided.
     * This is valid for Google users or users whose role will be assigned later.
     */
    return undefined;
  }
  private async assertExists(id: string): Promise<void> {
    const exists = await this.userRepository.existsById(id);
    if (!exists) {
      throw new NotFoundException(`User ${id} not found`);
    }
  }
}

function normalizeRole(role: string): string {
  return role
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}
