import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { EmailService } from '../notifications/email.service';
import { InviteTokenEntity } from './entities/invite-token.entity';
import { PasswordResetTokenEntity } from './entities/password-reset-token.entity';
import { LoginDto } from '../users/dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterWithInviteDto } from './dto/register-with-invite.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/user.entity';
import { AuthResponseDto } from './dto/auth-response.dto';
import { Role } from '../users/user-role.enum';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(InviteTokenEntity)
    private readonly inviteTokensRepository: Repository<InviteTokenEntity>,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly passwordResetTokensRepository: Repository<PasswordResetTokenEntity>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.validateUser(dto.email, dto.password);

    const payload: AuthenticatedUser = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.getJwtSecret(),
      expiresIn: '1d',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.getRefreshJwtSecret(),
      expiresIn: '30d',
    });

    return {
      accessToken,
      refreshToken,
      user: this.toUserDto(user),
    };
  }

  async me(userId: number): Promise<AuthResponseDto['user']> {
    const user = await this.usersService.findById(userId);
    return this.toUserDto(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponseDto> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const user = await this.usersService.findById(payload.userId);

    return this.issueTokens(user);
  }

  async inviteUser(dto: InviteUserDto): Promise<boolean> {
    const email = dto.email.toLowerCase();
    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('Користувач із цим email вже існує');
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.inviteTokensRepository.save({
      email,
      token,
      role: dto.role ?? Role.USER,
      expiresAt,
      usedAt: null,
    });

    const inviteUrl = this.buildFrontendUrl(`/register/${encodeURIComponent(token)}`);
    await this.emailService.sendInviteEmail(email, inviteUrl);

    return true;
  }

  async registerWithInvite(dto: RegisterWithInviteDto): Promise<AuthResponseDto> {
    const invite = await this.findValidInviteByToken(dto.token);

    const existingUser = await this.usersService.findByEmail(invite.email);

    if (existingUser) {
      throw new ConflictException('Користувач із цим email вже існує');
    }

    const user = await this.usersService.create({
      email: invite.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: invite.role,
    });

    invite.usedAt = new Date();
    await this.inviteTokensRepository.save(invite);

    return this.issueTokens(user);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<boolean> {
    const user = await this.usersService.findByEmail(dto.email);

    if (user) {
      const token = uuidv4();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await this.passwordResetTokensRepository.save({
        userId: user.id,
        token,
        expiresAt,
        usedAt: null,
      });

      const resetUrl = this.buildFrontendUrl(`/reset-password/${encodeURIComponent(token)}`);
      await this.emailService.sendPasswordResetEmail(user.email, resetUrl);
    }

    return true;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<boolean> {
    const resetToken = await this.findValidPasswordResetTokenByToken(dto.token);
    await this.usersService.updatePassword(resetToken.userId, dto.password);

    resetToken.usedAt = new Date();
    await this.passwordResetTokensRepository.save(resetToken);

    return true;
  }

  private async validateUser(email: string, password: string): Promise<UserEntity> {
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Невірний email або пароль');
    }

    const isPasswordValid = await this.usersService.validatePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Невірний email або пароль');
    }

    return user;
  }

  private async issueTokens(user: UserEntity): Promise<AuthResponseDto> {
    const payload: AuthenticatedUser = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.getJwtSecret(),
      expiresIn: '1d',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.getRefreshJwtSecret(),
      expiresIn: '30d',
    });

    return {
      accessToken,
      refreshToken,
      user: this.toUserDto(user),
    };
  }

  private async verifyRefreshToken(token: string): Promise<AuthenticatedUser> {
    try {
      return await this.jwtService.verifyAsync<AuthenticatedUser>(token, {
        secret: this.getRefreshJwtSecret(),
      });
    } catch {
      throw new UnauthorizedException('Недійсний або прострочений refresh токен');
    }
  }

  private async findValidInviteByToken(token: string): Promise<InviteTokenEntity> {
    const invite = await this.inviteTokensRepository.findOne({
      where: { token },
    });

    if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
      throw new UnauthorizedException('Недійсне або прострочене запрошення');
    }

    return invite;
  }

  private async findValidPasswordResetTokenByToken(
    token: string,
  ): Promise<PasswordResetTokenEntity> {
    const resetToken = await this.passwordResetTokensRepository.findOne({
      where: { token },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      throw new UnauthorizedException('Недійсний або прострочений токен');
    }

    return resetToken;
  }

  private toUserDto(user: UserEntity): AuthResponseDto['user'] {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }

  private getJwtSecret(): string {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }

    return secret;
  }

  private getRefreshJwtSecret(): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');

    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    return secret;
  }

  private buildFrontendUrl(path: string): string {
    const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL');

    if (!frontendUrl) {
      throw new Error('APP_FRONTEND_URL is not configured');
    }

    return new URL(path, frontendUrl).toString();
  }
}
