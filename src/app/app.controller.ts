import { Controller, Get } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../modules/users/user-role.enum';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  health(): { status: string } {
    return this.appService.health();
  }

  @Roles(Role.ADMIN)
  @Get('health/admin')
  adminOnly(): { status: string } {
    return { status: 'admin-ok' };
  }
}
