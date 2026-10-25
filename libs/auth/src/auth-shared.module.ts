import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PasswordService } from './password.service.js';
import { JwtTokenService } from './jwt.service.js';

@Module({
  imports: [JwtModule.register({})],
  providers: [PasswordService, JwtTokenService],
  exports: [PasswordService, JwtTokenService],
})
export class AuthSharedModule {}
