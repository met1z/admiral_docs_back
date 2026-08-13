import { Role } from '../../modules/users/user-role.enum';

export type AuthenticatedUser = {
  userId: number;
  email: string;
  role: Role;
};
