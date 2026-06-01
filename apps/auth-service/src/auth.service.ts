import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

interface User {
  id: number;
  username: string;
  password: string;
  email?: string;
}

@Injectable()
export class AuthService {
  private users: User[] = [];
  private nextId = 1;

  async register(username: string, password: string, email?: string) {
    if (this.users.find((u) => u.username === username)) {
      throw new HttpException('User already exists', HttpStatus.CONFLICT);
    }
    const user: User = { id: this.nextId++, username, password, email };
    this.users.push(user);
    return { id: user.id, username: user.username, email: user.email };
  }

  async validateUser(username: string, password: string) {
    const user = this.users.find((u) => u.username === username && u.password === password);
    return user ?? null;
  }

  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    if (!user) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }
    return { accessToken: this.generateToken({ sub: user.id, username: user.username }) };
  }

  async findById(id: number) {
    return this.users.find((u) => u.id === id) ?? null;
  }

  private generateToken(payload: Record<string, any>) {
    // Lightweight token stub (do not use in production). Replace with JwtService in real app.
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  decodeToken(token: string) {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }
}