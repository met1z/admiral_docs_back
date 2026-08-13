import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';

import { TypeOrmConfigService } from './typeorm-config.service';

export const databaseConfig: TypeOrmModuleAsyncOptions = {
  useClass: TypeOrmConfigService,
};
