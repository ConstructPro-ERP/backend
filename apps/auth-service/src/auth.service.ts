import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import * as process from 'node:process';

interface JwtPayload {
  sub: string;
  username: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  //  REGISTER USER
  async register(username: string, password: string, email: string) {
    console.log("ENV is",process.env.DATABASE_URL);
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new HttpException('User already exists', HttpStatus.CONFLICT);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        fullName: username, // was username: username
        password: hashedPassword,
        email: email,
        roleId: 'N/A',
      },
    });

    return {
      id: user.id,
      username: user.fullName,
      email: user.email,
    };
  }

  // ✅ VALIDATE USER
  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email },
    });

    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    return isMatch ? user : null;
  }

  // ✅ LOGIN USER
  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);

    if (!user) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const payload: JwtPayload = {
      sub: user.id,
      username: user.fullName,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.fullName,
        email: user.email,
      },
    };
  }

  // ✅ FIND USER BY ID
  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }
}
