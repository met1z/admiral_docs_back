import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { InviteTokenEntity } from './entities/invite-token.entity';
import { RefreshSessionEntity } from './entities/refresh-session.entity';
import { PasswordResetTokenEntity } from './entities/password-reset-token.entity';

@Module({
  imports: [
    UsersModule,
    NotificationsModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([
      InviteTokenEntity,
      PasswordResetTokenEntity,
      RefreshSessionEntity,
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
