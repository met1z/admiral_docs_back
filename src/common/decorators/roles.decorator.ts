import { SetMetadata } from '@nestjs/common';

import { Role } from '../../modules/users/user-role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]): ClassDecorator & MethodDecorator =>
  SetMetadata(ROLES_KEY, roles);
