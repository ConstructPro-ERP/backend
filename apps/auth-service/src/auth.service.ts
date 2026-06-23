import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../shared/error-codes';
interface GoogleUserPayload {
  googleId: string;
  email: string;
  displayName: string;
  avatar?: string;
}
@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async register(
    username: string,
    password: string,
    email: string,
    roleId: string,
  ) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new HttpException(
        {
          code: ErrorCode.USER_ALREADY_EXISTS,
          message: 'An account with this email already exists.',
        },
        HttpStatus.CONFLICT, // 409
      );
    }
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!role) {
      throw new HttpException(
        {
          code: ErrorCode.ROLE_NOT_FOUND,
          message: 'Role you assigned is incorrect.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        fullName: username,
        password: hashedPassword,
        email,
        roleId: roleId,
        status: 'ACTIVE',
      },
    });

    return { id: user.id, username: user.fullName, email: user.email };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Guard: Google-only users have no password — reject local login attempt
    if (!user || !user.password) return null;
    const isMatch = await bcrypt.compare(password, user.password);
    return isMatch ? user : null;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) {
      throw new HttpException(
        {
          code: ErrorCode.INVALID_CREDENTIALS,
          message: 'Email or password is incorrect.',
        },
        HttpStatus.UNAUTHORIZED, // 401
      );
    }

    const payload = { sub: user.id, username: user.fullName };
    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: user.id, username: user.fullName, email: user.email },
    };
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
  // async findOrCreateGoogleUser(payload: GoogleUserPayload) {
  //   const existing = await this.prisma.user.findFirst({
  //     where: {
  //       OR: [{ googleId: payload.googleId }, { email: payload.email }],
  //     },
  //   });
  //
  //   if (existing) {
  //     // Attach googleId if the user previously registered with email/password
  //     if (!existing.googleId) {
  //       return this.prisma.user.update({
  //         where: { id: existing.id },
  //         data: { googleId: payload.googleId, avatar: payload.avatar },
  //       });
  //     }
  //     return existing;
  //   }
  //
  //   // New user — fetch the default "user" role to avoid requiring roleId
  //   const defaultRole = await this.prisma.role.findFirst({
  //     where: { roleName: 'user' },
  //   });
  //
  //   return this.prisma.user.create({
  //     data: {
  //       googleId: payload.googleId,
  //       email: payload.email,
  //       fullName: payload.displayName,
  //       avatar: payload.avatar,
  //       status: 'ACTIVE',
  //       // Google users have no local password; null is intentional
  //       password: null,
  //       roleId: defaultRole?.id ?? null,
  //     },
  //   });
  // }
  //
  // // Issues a signed JWT for a Google-authenticated user (reused in controller)
  // issueTokenForUser(user: { id: string; fullName: string }) {
  //   const payload = { sub: user.id, username: user.fullName };
  //   return {
  //     accessToken: this.jwtService.sign(payload),
  //     user: { id: user.id, username: user.fullName },
  //   };
  // }
}
