import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role } from '@adlogs/shared';

export class CreateUserDto {
  @IsString()
  name!: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password!: string;

  @IsEnum(Role)
  role!: Role;
}
