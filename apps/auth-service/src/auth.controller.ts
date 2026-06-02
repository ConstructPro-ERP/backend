import { Controller, Post, Body, Get, Req, HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {RegisterDto} from './dto/register.dto';
import {LoginDto} from './dto/login.dto';


export class AuthController {
  constructor(private readonly authService: AuthService) {}


  async register( dto: RegisterDto) {
    return this.authService.register(dto.username, dto.password, dto.email);
  }


  async login( dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }


  async me( req: Request) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new HttpException('Missing token', HttpStatus.UNAUTHORIZED);
    }
    const token = auth.slice(7);
    const payload = this.authService.decodeToken(token);
    if (!payload || typeof payload.sub !== 'number') {
      throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
    }
    const user = await this.authService.findById(payload.sub);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    const { password, ...safe } = user;
    return safe;
  }
}