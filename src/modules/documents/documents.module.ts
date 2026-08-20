import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from '../users/users.module';
import { DocumentCommentEntity } from './entities/document-comment.entity';
import { DocumentFileEntity } from './entities/document-file.entity';
import { DocumentHistoryEventEntity } from './entities/document-history-event.entity';
import { DocumentParticipantEntity } from './entities/document-participant.entity';
import { DocumentTypeEntity } from './entities/document-type.entity';
import { DocumentEntity } from './entities/document.entity';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { R2StorageService } from './services/r2-storage.service';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([
      DocumentTypeEntity,
      DocumentEntity,
      DocumentCommentEntity,
      DocumentFileEntity,
      DocumentParticipantEntity,
      DocumentHistoryEventEntity,
    ]),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, R2StorageService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
