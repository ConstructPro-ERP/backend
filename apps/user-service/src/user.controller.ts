import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UsePipes,
} from '@nestjs/common';
import { UserService } from './user.service';
import { ZodValidationPipe } from '../../auth-service/src/dto/zod-validation.pipe';
import * as createUserDto from './dto/create-user.dto';
import * as updateUserDto from './dto/update-user.dto';
import * as updateProfileDto from './dto/update-profile.dto';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // Admin: list all users (add RolesGuard in app if needed)
  @Get()
  findAll() {
    return this.userService.findAll();
  }

  // Admin: create a user directly (bypasses auth-service registration)
  @Post()
  @UsePipes(new ZodValidationPipe(createUserDto.CreateUserSchema))
  create(@Body() dto: createUserDto.CreateUserDto) {
    return this.userService.create(dto);
  }

  // Get a single user by ID
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.userService.findById(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  // Admin: update any field on a user (role, status, etc.)
  @Patch(':id')
  @UsePipes(new ZodValidationPipe(updateUserDto.UpdateUserSchema))
  update(@Param('id') id: string, @Body() dto: updateUserDto.UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  // User: update own profile (fullName, avatar only)
  @Patch(':id/profile')
  @UsePipes(new ZodValidationPipe(updateProfileDto.UpdateProfileSchema))
  updateProfile(
    @Param('id') id: string,
    @Body() dto: updateProfileDto.UpdateProfileDto,
  ) {
    return this.userService.updateProfile(id, dto);
  }

  // Admin: soft-delete (sets status INACTIVE) or hard delete depending on policy
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.userService.remove(id);
  }
}