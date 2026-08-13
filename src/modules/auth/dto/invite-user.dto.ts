import { IsEmail, IsEnum, IsOptional } from 'class-validator';

import { Role } from '../../users/user-role.enum';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
