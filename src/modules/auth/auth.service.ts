import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { LoginDto } from '../users/dto/login.dto';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/user.entity';
import { AuthResponseDto } from './dto/auth-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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
}
