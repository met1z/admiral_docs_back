import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const synchronize = false;

    return {
      type: 'postgres',
      host: this.configService.get<string>('DATABASE_HOST', 'localhost'),
      port: this.configService.get<number>('DATABASE_PORT', 5432),
      username: this.configService.get<string>('DATABASE_USERNAME', 'postgres'),
      password: this.configService.get<string>('DATABASE_PASSWORD', 'postgres'),
      database: this.configService.get<string>('DATABASE_NAME', 'admiral_docs'),
      ssl: this.configService.get<string>('DATABASE_SSL', 'false') === 'true'
        ? { rejectUnauthorized: false }
        : false,
      synchronize,
      autoLoadEntities: true,
      migrationsRun: false,
      entities: ['dist/**/*.entity.js'],
      migrations: ['dist/database/migrations/*.js'],
      extra: {
        options: `-c timezone=${this.configService.get<string>(
          'DATABASE_TIMEZONE',
          'Europe/Kyiv',
        )}`,
      },
    };
  }
}
