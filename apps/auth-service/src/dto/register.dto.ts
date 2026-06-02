//Those are example codes anyone can change those
import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}