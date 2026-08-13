import { Role } from '../../users/user-role.enum';

export class AuthResponseDto {
  accessToken!: string;
  refreshToken!: string;
  user!: {
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: Role;
  };
}
