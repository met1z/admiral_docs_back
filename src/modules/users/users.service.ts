import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Brackets, Repository } from 'typeorm';

import { CreateUserDto } from './dto/create-user.dto';
import { UserEntity } from './user.entity';
import { Role } from './user-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async create(dto: CreateUserDto): Promise<UserEntity> {
    const existingUser = await this.usersRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('Користувач з таким email вже існує');
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = this.usersRepository.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      role: dto.role ?? Role.USER,
      isActive: true,
    });

    return this.usersRepository.save(user);
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async findByIds(ids: number[]): Promise<UserEntity[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.usersRepository
      .createQueryBuilder('user')
      .where('user.id IN (:...ids)', { ids })
      .orderBy('user.id', 'ASC')
      .getMany();
  }

  async search(query: string, limit: number): Promise<UserEntity[]> {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return this.usersRepository
      .createQueryBuilder('user')
      .where('user.is_active = true')
      .andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(user.email) LIKE :query', { query: `%${normalizedQuery}%` })
            .orWhere("LOWER(COALESCE(user.first_name, '')) LIKE :query", { query: `%${normalizedQuery}%` })
            .orWhere("LOWER(COALESCE(user.last_name, '')) LIKE :query", { query: `%${normalizedQuery}%` })
            .orWhere(
              `LOWER(TRIM(CONCAT(COALESCE(user.first_name, ''), ' ', COALESCE(user.last_name, '')))) LIKE :query`,
              { query: `%${normalizedQuery}%` },
            );
        }),
      )
      .orderBy('user.last_name', 'ASC')
      .addOrderBy('user.first_name', 'ASC')
      .addOrderBy('user.email', 'ASC')
      .take(limit)
      .getMany();
  }

  async findById(id: number): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }

    return user;
  }

  async validatePassword(password: string, passwordHash: string): Promise<boolean> {
    return argon2.verify(passwordHash, password);
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async updatePassword(userId: number, password: string): Promise<void> {
    const passwordHash = await this.hashPassword(password);

    await this.usersRepository.update(userId, {
      passwordHash,
    });
  }
}
