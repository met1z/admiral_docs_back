import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder, WhereExpressionBuilder } from 'typeorm';
import type { Express } from 'express';
import sanitizeFilename from 'sanitize-filename';

import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/user.entity';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { DocumentCommentEntity } from './entities/document-comment.entity';
import { DocumentFileEntity } from './entities/document-file.entity';
import { DocumentHistoryEventEntity } from './entities/document-history-event.entity';
import { DocumentParticipantEntity } from './entities/document-participant.entity';
import { DocumentTypeEntity } from './entities/document-type.entity';
import { DocumentEntity } from './entities/document.entity';
import { CreateDocumentDto } from './dto/create-document.dto';
import { AddDocumentCommentDto } from './dto/add-document-comment.dto';
import { CreateDocumentParticipantDto } from './dto/create-document-participant.dto';
import { DocumentQueryDto, DocumentSortBy } from './dto/document-query.dto';
import { RejectParticipantDto } from './dto/reject-participant.dto';
import { SendAdditionalApprovalDto } from './dto/send-additional-approval.dto';
import { UpdateDocumentFileDto } from './dto/update-document-file.dto';
import { UpdateDocumentNameDto } from './dto/update-document-name.dto';
import { DocumentHistoryEventType } from './enums/document-history-event-type.enum';
import { DocumentParticipantStatus } from './enums/document-participant-status.enum';
import { DocumentParticipantType } from './enums/document-participant-type.enum';
import { DocumentStatus } from './enums/document-status.enum';
import { DocumentDetailView, DocumentListItem } from './types/document-view.types';
import { R2StorageService } from './services/r2-storage.service';

type DocumentListRawRow = {
  document_id: string | number;
  document_type_id: string | number;
  document_created_by_user_id: string | number;
  document_name: string;
  document_status: DocumentStatus;
  document_submission_round: string | number;
  document_last_rejection_reason: string | null;
  document_last_rejected_by_user_id: string | number | null;
  document_last_rejected_at: string | Date | null;
  document_refunded_by_user_id: string | number | null;
  document_refunded_at: string | Date | null;
  document_completed_at: string | Date | null;
  document_created_at: string | Date;
  document_updated_at: string | Date;
  document_type_name: string | null;
  creator_first_name: string | null;
  creator_last_name: string | null;
  creator_email: string | null;
  current_action_user_id: string | number | null;
  current_action_first_name: string | null;
  current_action_last_name: string | null;
  current_action_email: string | null;
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(DocumentTypeEntity)
    private readonly documentTypesRepository: Repository<DocumentTypeEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentsRepository: Repository<DocumentEntity>,
    @InjectRepository(DocumentCommentEntity)
    private readonly documentCommentsRepository: Repository<DocumentCommentEntity>,
    @InjectRepository(DocumentFileEntity)
    private readonly documentFilesRepository: Repository<DocumentFileEntity>,
    @InjectRepository(DocumentParticipantEntity)
    private readonly documentParticipantsRepository: Repository<DocumentParticipantEntity>,
    @InjectRepository(DocumentHistoryEventEntity)
    private readonly documentHistoryEventsRepository: Repository<DocumentHistoryEventEntity>,
    private readonly r2StorageService: R2StorageService,
    private readonly usersService: UsersService,
  ) {}

  async listTypes(): Promise<DocumentTypeEntity[]> {
    return this.documentTypesRepository.find({
      order: {
        sortOrder: 'ASC',
        id: 'ASC',
      },
    });
  }

  async create(dto: CreateDocumentDto, actor: AuthenticatedUser): Promise<DocumentDetailView> {
    const documentType = await this.documentTypesRepository.findOne({
      where: { id: dto.typeId },
    });

    if (!documentType) {
      throw new NotFoundException('Тип документа не знайдено');
    }

    this.assertSequentialParticipants(dto.participants);

    const document = await this.documentsRepository.save(
      this.documentsRepository.create({
        typeId: dto.typeId,
        createdByUserId: actor.userId,
        name: dto.name,
        status: DocumentStatus.IN_PROGRESS,
        submissionRound: 1,
        lastRejectionReason: null,
        lastRejectedByUserId: null,
        lastRejectedAt: null,
        refundedByUserId: null,
        refundedAt: null,
        completedAt: null,
      }),
    );

    await this.documentFilesRepository.save(
      this.documentFilesRepository.create({
        documentId: document.id,
        storageKey: dto.file.storageKey,
        mimeType: dto.file.mimeType,
        isCurrent: true,
        url: dto.file.url,
        originalFileName: dto.file.originalFileName,
        sizeBytes: String(dto.file.sizeBytes),
      }),
    );

    const participants = dto.participants.map(participant =>
      this.documentParticipantsRepository.create({
        documentId: document.id,
        userId: participant.userId,
        participantType: participant.participantType,
        order: participant.order,
        addedByUserId: actor.userId,
        isPreservedAfterRejection: participant.isPreservedAfterRejection ?? false,
        signedStatus: DocumentParticipantStatus.PENDING,
      }),
    );

    await this.documentParticipantsRepository.save(participants);

    await this.createHistoryEvent({
      documentId: document.id,
      actorUserId: actor.userId,
      participantId: null,
      targetUserId: null,
      eventType: DocumentHistoryEventType.CREATED,
      message: 'Document created',
      reason: null,
      metadata: {
        submissionRound: 1,
      },
    });

    await this.createHistoryEvent({
      documentId: document.id,
      actorUserId: actor.userId,
      participantId: null,
      targetUserId: null,
      eventType: DocumentHistoryEventType.SENT_FOR_SIGNING,
      message: 'Document sent for signing',
      reason: null,
      metadata: null,
    });

    return this.getDetail(document.id, actor.userId);
  }

  async uploadStorageFile(
    file: Express.Multer.File | undefined,
    actor: AuthenticatedUser,
  ): Promise<{
    mimeType: string;
    storageKey: string;
    url: string;
    originalFileName: string;
    sizeBytes: number;
  }> {
    if (!file) {
      throw new BadRequestException('Файл не передано');
    }

    const originalFileName = this.normalizeUploadedFileName(file.originalname);

    this.assertSupportedUploadFile(file.mimetype, file.size, originalFileName);

    const safeName = this.sanitizeFileName(originalFileName);
    const storageKey = `documents/tmp/${actor.userId}/${Date.now()}-${randomUUID()}-${safeName}`;
    try {
      const uploaded = await this.r2StorageService.uploadBuffer({
        key: storageKey,
        buffer: file.buffer,
        mimeType: file.mimetype,
        fileName: originalFileName,
      });

      return {
        mimeType: file.mimetype,
        storageKey: uploaded.key,
        url: uploaded.publicUrl,
        originalFileName,
        sizeBytes: file.size,
      };
    } catch (error) {
      this.logger.error(
        `Failed to upload document file for user ${actor.userId}: originalName="${originalFileName}", rawOriginalName="${file.originalname}", mimeType="${file.mimetype}", sizeBytes=${file.size}, storageKey="${storageKey}"`,
        error instanceof Error ? error.stack : undefined,
      );

      throw error;
    }
  }

  async list(
    query: DocumentQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<{
    items: DocumentListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.documentsRepository
      .createQueryBuilder('document')
      .leftJoin(DocumentTypeEntity, 'document_type', 'document_type.id = document.type_id')
      .leftJoin(UserEntity, 'creator', 'creator.id = document.created_by_user_id')
      .leftJoin(
        'document_participant',
        'current_action_participant',
        `current_action_participant.id = (
          SELECT dp.id
          FROM document_participant dp
          WHERE dp.document_id = document.id
            AND dp.signed_status = :pendingStatus
          ORDER BY
            dp.order ASC,
            CASE
              WHEN dp.participant_type = :additionalApproverType THEN 0
              ELSE 1
            END ASC,
            dp.created_at ASC,
            dp.id ASC
          LIMIT 1
        )`,
      )
      .leftJoin(
        UserEntity,
        'current_action_user',
        'current_action_user.id = current_action_participant.user_id',
      );

    this.applyDocumentAccessFilter(qb, currentUser.userId);
    qb.setParameter('pendingStatus', DocumentParticipantStatus.PENDING);
    qb.setParameter('additionalApproverType', DocumentParticipantType.ADDITIONAL_APPROVER);

    if (query.typeId) {
      qb.andWhere('document.type_id = :typeId', { typeId: query.typeId });
    }

    if (query.status) {
      qb.andWhere('document.status = :status', { status: query.status });
    }

    if (query.statusGroup === 'completed') {
      qb.andWhere('document.status = :completedStatus', {
        completedStatus: DocumentStatus.COMPLETED,
      });
    } else if (query.statusGroup === 'active') {
      qb.andWhere('document.status IN (:...activeStatuses)', {
        activeStatuses: [DocumentStatus.IN_PROGRESS, DocumentStatus.REJECTED],
      });
    }

    if (query.revisionType) {
      if (query.revisionType === 'new') {
        qb.andWhere('document.submission_round = 1');
      } else {
        qb.andWhere('document.submission_round > 1');
      }
    }

    if (query.requiresAction) {
      qb.andWhere(
        `(
          current_action_user.id = :currentUserId
          OR (
            document.status IN (:...requiresActionStatuses)
            AND document.created_by_user_id = :currentUserId
          )
        )`,
        {
          currentUserId: currentUser.userId,
          requiresActionStatuses: [DocumentStatus.REJECTED, DocumentStatus.REFUNDED],
        },
      );
    }

    if (query.search) {
      qb.andWhere('LOWER(document.name) LIKE LOWER(:search)', {
        search: `%${query.search}%`,
      });
    }

    if (query.creatorName) {
      qb.andWhere(
        `LOWER(COALESCE(creator.first_name, '') || ' ' || COALESCE(creator.last_name, '')) LIKE LOWER(:creatorName)`,
        {
          creatorName: `%${query.creatorName}%`,
        },
      );
    }

    const sortDirection = query.sortDirection ?? 'DESC';
    switch (query.sortBy ?? DocumentSortBy.CREATED_AT) {
      case DocumentSortBy.NAME:
        qb.orderBy('document.name', sortDirection);
        break;
      case DocumentSortBy.CREATOR_NAME:
        qb.orderBy('creator.last_name', sortDirection)
          .addOrderBy('creator.first_name', sortDirection)
          .addOrderBy('creator.email', sortDirection);
        break;
      case DocumentSortBy.STATUS:
        qb.orderBy('document.status', sortDirection);
        break;
      case DocumentSortBy.REVISION_TYPE:
        qb.orderBy('document.submission_round', sortDirection);
        break;
      case DocumentSortBy.CREATED_AT:
      default:
        qb.orderBy('document.created_at', sortDirection);
        break;
    }

    const countQb = qb.clone();
    const total = await countQb.getCount();
    const rawRows = (await qb
      .skip(skip)
      .take(limit)
      .select([
        'document.id AS document_id',
        'document.type_id AS document_type_id',
        'document.created_by_user_id AS document_created_by_user_id',
        'document.name AS document_name',
        'document.status AS document_status',
        'document.submission_round AS document_submission_round',
        'document.last_rejection_reason AS document_last_rejection_reason',
        'document.last_rejected_by_user_id AS document_last_rejected_by_user_id',
        'document.last_rejected_at AS document_last_rejected_at',
        'document.refunded_by_user_id AS document_refunded_by_user_id',
        'document.refunded_at AS document_refunded_at',
        'document.completed_at AS document_completed_at',
        'document.created_at AS document_created_at',
        'document.updated_at AS document_updated_at',
        'document_type.name AS document_type_name',
        'creator.first_name AS creator_first_name',
        'creator.last_name AS creator_last_name',
        'creator.email AS creator_email',
        'current_action_user.id AS current_action_user_id',
        'current_action_user.first_name AS current_action_first_name',
        'current_action_user.last_name AS current_action_last_name',
        'current_action_user.email AS current_action_email',
      ])
      .getRawMany()) as DocumentListRawRow[];

    return {
      items: rawRows.map(row => this.mapDocumentListItem(row, currentUser.userId)),
      total,
      page,
      limit,
    };
  }

  async getDetail(documentId: number, currentUserId: number): Promise<DocumentDetailView> {
    const document = await this.getAccessibleDocumentOrThrow(documentId, currentUserId);

    const documentType = await this.documentTypesRepository.findOne({
      where: { id: document.typeId },
    });

    const [currentFile, comments, participants, history] = await Promise.all([
      this.documentFilesRepository.findOne({
        where: { documentId: document.id, isCurrent: true },
      }),
      this.documentCommentsRepository.find({
        where: { documentId: document.id },
        order: {
          createdAt: 'ASC',
          id: 'ASC',
        },
      }),
      this.documentParticipantsRepository.find({
        where: { documentId: document.id },
        order: {
          order: 'ASC',
          createdAt: 'ASC',
          id: 'ASC',
        },
      }),
      this.documentHistoryEventsRepository.find({
        where: { documentId: document.id },
        order: {
          createdAt: 'ASC',
          id: 'ASC',
        },
      }),
    ]);

    return this.mapDocumentDetail(
      document,
      documentType?.name ?? null,
      currentFile,
      participants,
      comments,
      history,
      currentUserId,
    );
  }

  async updateName(
    documentId: number,
    dto: UpdateDocumentNameDto,
    actor: AuthenticatedUser,
  ): Promise<DocumentDetailView> {
    const document = await this.getEditableDocument(documentId, actor.userId);

    if (document.name === dto.name) {
      return this.getDetail(document.id, actor.userId);
    }

    const previousName = document.name;
    document.name = dto.name;
    await this.documentsRepository.save(document);

    await this.createHistoryEvent({
      documentId: document.id,
      actorUserId: actor.userId,
      participantId: null,
      targetUserId: null,
      eventType: DocumentHistoryEventType.NAME_REPLACED,
      message: `Document name changed from "${previousName}" to "${dto.name}"`,
      reason: null,
      metadata: {
        previousName,
        newName: dto.name,
      },
    });

    return this.getDetail(document.id, actor.userId);
  }

  async updateFile(
    documentId: number,
    dto: UpdateDocumentFileDto,
    actor: AuthenticatedUser,
  ): Promise<DocumentDetailView> {
    const document = await this.getEditableDocument(documentId, actor.userId);

    const currentFile = await this.documentFilesRepository.findOne({
      where: { documentId: document.id, isCurrent: true },
    });

    if (currentFile) {
      currentFile.isCurrent = false;
      await this.documentFilesRepository.save(currentFile);
    }

    const newFile = await this.documentFilesRepository.save(
      this.documentFilesRepository.create({
        documentId: document.id,
        storageKey: dto.file.storageKey,
        mimeType: dto.file.mimeType,
        isCurrent: true,
        url: dto.file.url,
        originalFileName: dto.file.originalFileName,
        sizeBytes: String(dto.file.sizeBytes),
      }),
    );

    await this.createHistoryEvent({
      documentId: document.id,
      actorUserId: actor.userId,
      participantId: null,
      targetUserId: null,
      eventType: DocumentHistoryEventType.FILE_REPLACED,
      message: 'Document file replaced',
      reason: null,
      metadata: {
        documentFileId: newFile.id,
        originalFileName: newFile.originalFileName,
      },
    });

    return this.getDetail(document.id, actor.userId);
  }

  async addComment(
    documentId: number,
    dto: AddDocumentCommentDto,
    actor: AuthenticatedUser,
  ): Promise<DocumentDetailView> {
    const document = await this.getAccessibleDocumentOrThrow(documentId, actor.userId);
    const comment = dto.comment.trim();

    if (!comment) {
      throw new BadRequestException('Коментар не може бути порожнім');
    }

    const savedComment = await this.documentCommentsRepository.save(
      this.documentCommentsRepository.create({
        documentId: document.id,
        actorUserId: actor.userId,
        message: comment,
      }),
    );

    await this.createHistoryEvent({
      documentId: document.id,
      actorUserId: actor.userId,
      participantId: null,
      targetUserId: null,
      eventType: DocumentHistoryEventType.COMMENT_ADDED,
      message: comment,
      reason: null,
      metadata: {
        documentCommentId: savedComment.id,
      },
    });

    return this.getDetail(document.id, actor.userId);
  }

  async refundDocument(documentId: number, actor: AuthenticatedUser): Promise<DocumentDetailView> {
    const document = await this.getAccessibleDocumentOrThrow(documentId, actor.userId);

    if (document.createdByUserId !== actor.userId) {
      throw new ForbiddenException('Тільки ініціатор може відгукнути документ');
    }

    if (document.status === DocumentStatus.REFUNDED) {
      return this.getDetail(document.id, actor.userId);
    }

    if (document.status !== DocumentStatus.IN_PROGRESS) {
      throw new BadRequestException('Відгукнути можна лише документ у роботі');
    }

    const participants = await this.getDocumentParticipants(document.id);
    if (
      participants.some(
        participant => participant.signedStatus !== DocumentParticipantStatus.PENDING,
      )
    ) {
      throw new BadRequestException('Відгукнути можна лише документ без підписів');
    }

    document.status = DocumentStatus.REFUNDED;
    document.refundedByUserId = actor.userId;
    document.refundedAt = new Date();
    document.lastRejectionReason = null;
    document.lastRejectedByUserId = null;
    document.lastRejectedAt = null;
    document.completedAt = null;
    await this.documentsRepository.save(document);

    await this.createHistoryEvent({
      documentId: document.id,
      actorUserId: actor.userId,
      participantId: null,
      targetUserId: null,
      eventType: DocumentHistoryEventType.REFUNDED,
      message: 'Document refunded by initiator',
      reason: null,
      metadata: null,
    });

    return this.getDetail(document.id, actor.userId);
  }

  async deleteDocument(documentId: number, actor: AuthenticatedUser): Promise<{ deleted: true }> {
    const document = await this.getAccessibleDocumentOrThrow(documentId, actor.userId);

    if (document.createdByUserId !== actor.userId) {
      throw new ForbiddenException('Тільки ініціатор може видалити документ');
    }

    if (
      document.status !== DocumentStatus.REFUNDED &&
      document.status !== DocumentStatus.REJECTED
    ) {
      throw new BadRequestException('Видаляти можна лише відхилений або відгукнутий документ');
    }

    await this.createHistoryEvent({
      documentId: document.id,
      actorUserId: actor.userId,
      participantId: null,
      targetUserId: null,
      eventType: DocumentHistoryEventType.DELETED,
      message: 'Document deleted',
      reason: null,
      metadata: null,
    });

    const currentFile = await this.documentFilesRepository.findOne({
      where: { documentId: document.id, isCurrent: true },
    });
    if (currentFile?.storageKey) {
      await this.r2StorageService.deleteObject(currentFile.storageKey);
    }

    await this.documentFilesRepository.delete({ documentId: document.id });
    await this.documentParticipantsRepository.delete({ documentId: document.id });
    await this.documentsRepository.delete({ id: document.id });

    return { deleted: true };
  }

  async getFileViewUrl(documentId: number, actor: AuthenticatedUser): Promise<{ url: string }> {
    const document = await this.getAccessibleDocumentOrThrow(documentId, actor.userId);
    const file = await this.documentFilesRepository.findOne({
      where: { documentId: document.id, isCurrent: true },
    });

    if (!file) {
      throw new NotFoundException('Файл не знайдено');
    }

    return {
      url: file.storageKey
        ? await this.r2StorageService.createSignedGetUrl({
            key: file.storageKey,
            fileName: file.originalFileName,
            mimeType: file.mimeType,
            disposition: 'inline',
          })
        : file.url,
    };
  }

  async getFileDownloadUrl(documentId: number, actor: AuthenticatedUser): Promise<{ url: string }> {
    const document = await this.getAccessibleDocumentOrThrow(documentId, actor.userId);
    const file = await this.documentFilesRepository.findOne({
      where: { documentId: document.id, isCurrent: true },
    });

    if (!file) {
      throw new NotFoundException('Файл не знайдено');
    }

    return {
      url: file.storageKey
        ? await this.r2StorageService.createSignedGetUrl({
            key: file.storageKey,
            fileName: file.originalFileName,
            mimeType: file.mimeType,
            disposition: 'attachment',
          })
        : file.url,
    };
  }

  async signParticipant(
    documentId: number,
    participantId: number,
    actor: AuthenticatedUser,
  ): Promise<DocumentDetailView> {
    const document = await this.getSignableDocument(documentId, actor.userId);
    const participants = await this.getDocumentParticipants(document.id);
    const currentParticipant = this.getCurrentActionParticipant(participants);

    if (!currentParticipant || currentParticipant.id !== participantId) {
      throw new BadRequestException('Зараз не черга цього учасника');
    }

    currentParticipant.signedStatus = DocumentParticipantStatus.COMPLETED;
    await this.documentParticipantsRepository.save(currentParticipant);

    await this.createHistoryEvent({
      documentId: document.id,
      actorUserId: actor.userId,
      participantId: currentParticipant.id,
      targetUserId: currentParticipant.userId,
      eventType: DocumentHistoryEventType.SIGNED,
      message: 'Participant signed document',
      reason: null,
      metadata: {
        participantType: currentParticipant.participantType,
      },
    });

    if (currentParticipant.participantType === DocumentParticipantType.ADDITIONAL_APPROVER) {
      await this.createHistoryEvent({
        documentId: document.id,
        actorUserId: actor.userId,
        participantId: currentParticipant.id,
        targetUserId: currentParticipant.userId,
        eventType: DocumentHistoryEventType.ADDITIONAL_APPROVAL_ACCEPTED,
        message: 'Additional approval accepted',
        reason: null,
        metadata: null,
      });
    }

    const remainingParticipants = participants.filter(
      participant => participant.id !== currentParticipant.id,
    );

    if (
      remainingParticipants.every(
        participant => participant.signedStatus === DocumentParticipantStatus.COMPLETED,
      )
    ) {
      document.status = DocumentStatus.COMPLETED;
      document.completedAt = new Date();
      await this.documentsRepository.save(document);

      await this.createHistoryEvent({
        documentId: document.id,
        actorUserId: actor.userId,
        participantId: currentParticipant.id,
        targetUserId: null,
        eventType: DocumentHistoryEventType.COMPLETED,
        message: 'Document completed',
        reason: null,
        metadata: null,
      });
    }

    return this.getDetail(document.id, actor.userId);
  }

  async sendForAdditionalApproval(
    documentId: number,
    participantId: number,
    dto: SendAdditionalApprovalDto,
    actor: AuthenticatedUser,
  ): Promise<DocumentDetailView> {
    const document = await this.getSignableDocument(documentId, actor.userId);
    const participants = await this.getDocumentParticipants(document.id);
    const currentParticipant = this.getCurrentActionParticipant(participants);

    if (!currentParticipant || currentParticipant.id !== participantId) {
      throw new BadRequestException('Зараз не черга цього учасника');
    }

    if (dto.userIds.length === 0) {
      throw new BadRequestException('Потрібно вказати хоча б одного учасника');
    }

    const uniqueUserIds = [...new Set(dto.userIds)];
    await Promise.all(uniqueUserIds.map(userId => this.usersService.findById(userId)));

    for (const userId of uniqueUserIds) {
      const existingParticipant = participants.find(participant => participant.userId === userId);

      if (existingParticipant) {
        throw new ConflictException(
          `Користувач ${userId} вже є серед підписантів або погоджувачів`,
        );
      }
    }

    const newParticipants = uniqueUserIds.map(userId =>
      this.documentParticipantsRepository.create({
        documentId: document.id,
        userId,
        participantType: DocumentParticipantType.ADDITIONAL_APPROVER,
        order: currentParticipant.order,
        addedByUserId: actor.userId,
        isPreservedAfterRejection: false,
        signedStatus: DocumentParticipantStatus.PENDING,
      }),
    );

    await this.documentParticipantsRepository.save(newParticipants);

    for (const userId of uniqueUserIds) {
      await this.createHistoryEvent({
        documentId: document.id,
        actorUserId: actor.userId,
        participantId: currentParticipant.id,
        targetUserId: userId,
        eventType: DocumentHistoryEventType.SENT_FOR_ADDITIONAL_APPROVAL,
        message: dto.message ?? null,
        reason: dto.reason ?? null,
        metadata: {
          addedParticipantType: DocumentParticipantType.ADDITIONAL_APPROVER,
        },
      });
    }

    return this.getDetail(document.id, actor.userId);
  }

  async rejectParticipant(
    documentId: number,
    participantId: number,
    dto: RejectParticipantDto,
    actor: AuthenticatedUser,
  ): Promise<DocumentDetailView> {
    const document = await this.getSignableDocument(documentId, actor.userId);
    const participants = await this.getDocumentParticipants(document.id);
    const currentParticipant = this.getCurrentActionParticipant(participants);

    if (!currentParticipant || currentParticipant.id !== participantId) {
      throw new BadRequestException('Зараз не черга цього учасника');
    }

    currentParticipant.signedStatus = DocumentParticipantStatus.REJECTED;
    if (currentParticipant.participantType === DocumentParticipantType.ADDITIONAL_APPROVER) {
      currentParticipant.isPreservedAfterRejection = true;
    }

    await this.documentParticipantsRepository.save(currentParticipant);

    const participantsToRemove = participants.filter(
      participant =>
        participant.participantType === DocumentParticipantType.ADDITIONAL_APPROVER &&
        !participant.isPreservedAfterRejection &&
        participant.id !== currentParticipant.id,
    );

    if (participantsToRemove.length > 0) {
      await this.documentParticipantsRepository
        .createQueryBuilder()
        .delete()
        .from(DocumentParticipantEntity)
        .where('id IN (:...ids)', { ids: participantsToRemove.map(participant => participant.id) })
        .execute();
    }

    const participantsToReset = participants.filter(
      participant =>
        participant.id !== currentParticipant.id && !participantsToRemove.includes(participant),
    );

    for (const participant of participantsToReset) {
      participant.signedStatus = DocumentParticipantStatus.PENDING;
    }

    await this.documentParticipantsRepository.save(participantsToReset);

    document.status = DocumentStatus.REJECTED;
    document.lastRejectionReason = dto.reason;
    document.lastRejectedByUserId = actor.userId;
    document.lastRejectedAt = new Date();
    document.completedAt = null;
    await this.documentsRepository.save(document);

    await this.createHistoryEvent({
      documentId: document.id,
      actorUserId: actor.userId,
      participantId: currentParticipant.id,
      targetUserId: currentParticipant.userId,
      eventType:
        currentParticipant.participantType === DocumentParticipantType.ADDITIONAL_APPROVER
          ? DocumentHistoryEventType.ADDITIONAL_APPROVAL_REJECTED
          : DocumentHistoryEventType.REJECTED,
      message: dto.message ?? null,
      reason: dto.reason,
      metadata: {
        participantType: currentParticipant.participantType,
      },
    });

    await this.documentCommentsRepository.save(
      this.documentCommentsRepository.create({
        documentId: document.id,
        actorUserId: actor.userId,
        message: `Повернуто: "${dto.reason.trim()}"`,
      }),
    );

    await this.createHistoryEvent({
      documentId: document.id,
      actorUserId: actor.userId,
      participantId: null,
      targetUserId: document.createdByUserId,
      eventType: DocumentHistoryEventType.RETURNED_FOR_REVISION,
      message: 'Document returned for revision',
      reason: dto.reason,
      metadata: null,
    });

    return this.getDetail(document.id, actor.userId);
  }

  async resubmit(documentId: number, actor: AuthenticatedUser): Promise<DocumentDetailView> {
    const document = await this.getAccessibleDocumentOrThrow(documentId, actor.userId);

    if (document.createdByUserId !== actor.userId) {
      throw new ForbiddenException('Тільки ініціатор може повторно відправити документ');
    }

    if (
      document.status !== DocumentStatus.REJECTED &&
      document.status !== DocumentStatus.REFUNDED
    ) {
      throw new BadRequestException(
        'Повторно можна відправити тільки відхилений або відгукнутий документ',
      );
    }

    const participants = await this.getDocumentParticipants(document.id);
    for (const participant of participants) {
      participant.signedStatus = DocumentParticipantStatus.PENDING;
    }
    await this.documentParticipantsRepository.save(participants);

    document.status = DocumentStatus.IN_PROGRESS;
    document.submissionRound += 1;
    document.lastRejectionReason = null;
    document.lastRejectedByUserId = null;
    document.lastRejectedAt = null;
    document.refundedByUserId = null;
    document.refundedAt = null;
    await this.documentsRepository.save(document);

    await this.createHistoryEvent({
      documentId: document.id,
      actorUserId: actor.userId,
      participantId: null,
      targetUserId: null,
      eventType: DocumentHistoryEventType.RESUBMITTED,
      message: 'Document resubmitted',
      reason: null,
      metadata: {
        submissionRound: document.submissionRound,
      },
    });

    return this.getDetail(document.id, actor.userId);
  }

  private async getEditableDocument(
    documentId: number,
    actorUserId: number,
  ): Promise<DocumentEntity> {
    const document = await this.getAccessibleDocumentOrThrow(documentId, actorUserId);

    if (document.createdByUserId !== actorUserId) {
      throw new ForbiddenException('Тільки ініціатор може редагувати документ');
    }

    if (document.status === DocumentStatus.COMPLETED) {
      throw new BadRequestException('Завершений документ редагувати не можна');
    }

    if (
      document.status !== DocumentStatus.REJECTED &&
      document.status !== DocumentStatus.REFUNDED
    ) {
      throw new BadRequestException('Редагування доступне тільки після відхилення або відгукнення');
    }

    return document;
  }

  private async getSignableDocument(
    documentId: number,
    actorUserId: number,
  ): Promise<DocumentEntity> {
    const document = await this.getAccessibleDocumentOrThrow(documentId, actorUserId);

    if (document.status !== DocumentStatus.IN_PROGRESS) {
      throw new BadRequestException('Документ вже завершено або відхилено');
    }

    const participants = await this.getDocumentParticipants(document.id);
    const currentParticipant = this.getCurrentActionParticipant(participants);

    if (!currentParticipant) {
      throw new BadRequestException('Немає активного учасника для дії');
    }

    if (currentParticipant.userId !== actorUserId) {
      throw new ForbiddenException('Зараз не ваша черга');
    }

    return document;
  }

  private async getDocumentParticipants(documentId: number): Promise<DocumentParticipantEntity[]> {
    return this.documentParticipantsRepository.find({
      where: { documentId },
      order: {
        order: 'ASC',
        createdAt: 'ASC',
        id: 'ASC',
      },
    });
  }

  private getCurrentActionParticipant(
    participants: DocumentParticipantEntity[],
  ): DocumentParticipantEntity | null {
    const sortedParticipants = this.sortParticipants(participants);
    return (
      sortedParticipants.find(
        participant => participant.signedStatus === DocumentParticipantStatus.PENDING,
      ) ?? null
    );
  }

  private sortParticipants(participants: DocumentParticipantEntity[]): DocumentParticipantEntity[] {
    return [...participants].sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }

      if (left.participantType !== right.participantType) {
        if (left.participantType === DocumentParticipantType.ADDITIONAL_APPROVER) {
          return -1;
        }

        if (right.participantType === DocumentParticipantType.ADDITIONAL_APPROVER) {
          return 1;
        }
      }

      const leftCreatedAt = left.createdAt.getTime();
      const rightCreatedAt = right.createdAt.getTime();

      if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt;
      }

      return left.id - right.id;
    });
  }

  private groupParticipantsByDocumentId(
    participants: DocumentParticipantEntity[],
  ): Map<number, DocumentParticipantEntity[]> {
    const grouped = new Map<number, DocumentParticipantEntity[]>();

    for (const participant of participants) {
      const existing = grouped.get(participant.documentId) ?? [];
      existing.push(participant);
      grouped.set(participant.documentId, existing);
    }

    return grouped;
  }

  private mapDocumentListItem(row: DocumentListRawRow, currentUserId: number): DocumentListItem {
    const currentActionUserId = row.current_action_user_id
      ? Number(row.current_action_user_id)
      : null;
    const currentActionFirstName = String(row.current_action_first_name ?? '');
    const currentActionLastName = String(row.current_action_last_name ?? '');
    const currentActionEmail = String(row.current_action_email ?? '');

    const creatorFirstName = String(row.creator_first_name ?? '');
    const creatorLastName = String(row.creator_last_name ?? '');
    const creatorEmail = String(row.creator_email ?? '');

    return {
      id: Number(row.document_id),
      typeId: Number(row.document_type_id),
      typeName: row.document_type_name ? String(row.document_type_name) : null,
      createdByUserId: Number(row.document_created_by_user_id),
      createdByFullName:
        [creatorFirstName, creatorLastName].filter(Boolean).join(' ') || creatorEmail,
      name: String(row.document_name),
      status: row.document_status as DocumentStatus,
      revisionType: Number(row.document_submission_round) > 1 ? 'repeat' : 'new',
      submissionRound: Number(row.document_submission_round),
      lastRejectionReason: row.document_last_rejection_reason
        ? String(row.document_last_rejection_reason)
        : null,
      lastRejectedByUserId: row.document_last_rejected_by_user_id
        ? Number(row.document_last_rejected_by_user_id)
        : null,
      lastRejectedAt: row.document_last_rejected_at
        ? new Date(String(row.document_last_rejected_at))
        : null,
      refundedByUserId: row.document_refunded_by_user_id
        ? Number(row.document_refunded_by_user_id)
        : null,
      refundedAt: row.document_refunded_at ? new Date(String(row.document_refunded_at)) : null,
      completedAt: row.document_completed_at ? new Date(String(row.document_completed_at)) : null,
      createdAt: new Date(String(row.document_created_at)),
      updatedAt: new Date(String(row.document_updated_at)),
      requiresAction:
        currentActionUserId === currentUserId ||
        ((row.document_status === DocumentStatus.REJECTED ||
          row.document_status === DocumentStatus.REFUNDED) &&
          Number(row.document_created_by_user_id) === currentUserId),
      myParticipantId: null,
      myParticipantStatus: null,
      myParticipantType: null,
      currentActionFullName:
        row.document_status !== DocumentStatus.REFUNDED &&
        row.document_status !== DocumentStatus.REJECTED &&
        currentActionUserId
          ? [currentActionFirstName, currentActionLastName].filter(Boolean).join(' ') ||
            currentActionEmail
          : null,
    };
  }

  private async mapDocumentDetail(
    document: DocumentEntity,
    typeName: string | null,
    currentFile: DocumentFileEntity | null,
    participants: DocumentParticipantEntity[],
    comments: DocumentCommentEntity[],
    history: DocumentHistoryEventEntity[],
    currentUserId: number,
  ): Promise<DocumentDetailView> {
    const sortedParticipants = this.sortParticipants(participants);
    const currentActionParticipant =
      document.status === DocumentStatus.REFUNDED
        ? null
        : this.getCurrentActionParticipant(sortedParticipants);
    const myParticipant =
      sortedParticipants.find(participant => participant.userId === currentUserId) ?? null;

    const userIds = new Set<number>([
      document.createdByUserId,
      ...(document.lastRejectedByUserId ? [document.lastRejectedByUserId] : []),
      ...sortedParticipants.map(participant => participant.userId),
      ...comments.map(comment => comment.actorUserId),
      ...history.map(event => event.actorUserId),
      ...history
        .flatMap(event => [event.participantId, event.targetUserId])
        .filter((value): value is number => value !== null),
    ]);

    const users = await this.usersService.findByIds(Array.from(userIds));
    const userMap = new Map(users.map(user => [user.id, user]));
    const creator = userMap.get(document.createdByUserId);

    if (!creator) {
      throw new NotFoundException('Користувача не знайдено');
    }

    const currentActionUser = currentActionParticipant
      ? (userMap.get(currentActionParticipant.userId) ?? null)
      : null;

    return {
      id: document.id,
      typeId: document.typeId,
      typeName,
      createdByUserId: document.createdByUserId,
      createdByFullName:
        [creator.firstName, creator.lastName].filter(Boolean).join(' ') || creator.email,
      name: document.name,
      status: document.status,
      revisionType: document.submissionRound > 1 ? 'repeat' : 'new',
      submissionRound: document.submissionRound,
      lastRejectionReason: document.lastRejectionReason,
      lastRejectedByUserId: document.lastRejectedByUserId,
      lastRejectedAt: document.lastRejectedAt,
      refundedByUserId: document.refundedByUserId,
      refundedAt: document.refundedAt,
      completedAt: document.completedAt,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      currentFile: currentFile
        ? {
            id: currentFile.id,
            storageKey: currentFile.storageKey,
            mimeType: currentFile.mimeType,
            isCurrent: currentFile.isCurrent,
            url: currentFile.url,
            originalFileName: currentFile.originalFileName,
            sizeBytes: currentFile.sizeBytes,
            previewUrl: currentFile.storageKey
              ? await this.r2StorageService.createSignedGetUrl({
                  key: currentFile.storageKey,
                  fileName: currentFile.originalFileName,
                  mimeType: currentFile.mimeType,
                  disposition: 'inline',
                })
              : currentFile.url,
            downloadUrl: currentFile.storageKey
              ? await this.r2StorageService.createSignedGetUrl({
                  key: currentFile.storageKey,
                  fileName: currentFile.originalFileName,
                  mimeType: currentFile.mimeType,
                  disposition: 'attachment',
                })
              : currentFile.url,
          }
        : null,
      participants: sortedParticipants.map(participant => ({
        id: participant.id,
        userId: participant.userId,
        userEmail: userMap.get(participant.userId)?.email ?? null,
        userFirstName: userMap.get(participant.userId)?.firstName ?? null,
        userLastName: userMap.get(participant.userId)?.lastName ?? null,
        participantType: participant.participantType,
        order: participant.order,
        addedByUserId: participant.addedByUserId,
        isPreservedAfterRejection: participant.isPreservedAfterRejection,
        signedStatus: participant.signedStatus,
        createdAt: participant.createdAt,
        updatedAt: participant.updatedAt,
        isCurrentAction: currentActionParticipant?.id === participant.id,
      })),
      comments: comments.map(comment => ({
        id: comment.id,
        actorUserId: comment.actorUserId,
        actorFullName: (() => {
          const actor = userMap.get(comment.actorUserId);

          return actor
            ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email
            : '—';
        })(),
        message: comment.message,
        createdAt: comment.createdAt,
      })),
      history: history.map(event => ({
        actorFullName: (() => {
          const actor = userMap.get(event.actorUserId);

          return actor
            ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email
            : '—';
        })(),
        id: event.id,
        actorUserId: event.actorUserId,
        participantId: event.participantId,
        targetUserId: event.targetUserId,
        targetFullName: event.targetUserId
          ? (() => {
              const target = userMap.get(event.targetUserId);

              return target
                ? [target.firstName, target.lastName].filter(Boolean).join(' ') || target.email
                : null;
            })()
          : null,
        eventType: event.eventType,
        message: event.message,
        reason: event.reason,
        metadata: event.metadata,
        createdAt: event.createdAt,
      })),
      requiresAction: Boolean(
        currentActionParticipant && currentActionParticipant.userId === currentUserId,
      ),
      myParticipantId: myParticipant?.id ?? null,
      myParticipantStatus: myParticipant?.signedStatus ?? null,
      myParticipantType: myParticipant?.participantType ?? null,
      currentActionFullName: currentActionUser
        ? [currentActionUser.firstName, currentActionUser.lastName].filter(Boolean).join(' ') ||
          currentActionUser.email
        : null,
    };
  }

  private async createHistoryEvent(input: {
    documentId: number;
    actorUserId: number;
    participantId: number | null;
    targetUserId: number | null;
    eventType: DocumentHistoryEventType;
    message: string | null;
    reason: string | null;
    metadata: Record<string, unknown> | null;
  }): Promise<DocumentHistoryEventEntity> {
    return this.documentHistoryEventsRepository.save(
      this.documentHistoryEventsRepository.create({
        documentId: input.documentId,
        actorUserId: input.actorUserId,
        participantId: input.participantId,
        targetUserId: input.targetUserId,
        eventType: input.eventType,
        message: input.message,
        reason: input.reason,
        metadata: input.metadata,
      }),
    );
  }

  private applyDocumentAccessFilter(qb: SelectQueryBuilder<DocumentEntity>, userId: number): void {
    qb.andWhere(
      new Brackets((accessQb: WhereExpressionBuilder) => {
        accessQb
          .where('document.created_by_user_id = :accessUserId', { accessUserId: userId })
          .orWhere(
            `EXISTS (
              SELECT 1
              FROM document_participant dp
              WHERE dp.document_id = document.id
                AND dp.user_id = :accessUserId
            )`,
            { accessUserId: userId },
          );
      }),
    );
  }

  private async getAccessibleDocumentOrThrow(
    documentId: number,
    userId: number,
  ): Promise<DocumentEntity> {
    const document = await this.documentsRepository
      .createQueryBuilder('document')
      .where('document.id = :documentId', { documentId })
      .andWhere(
        new Brackets((accessQb: WhereExpressionBuilder) => {
          accessQb.where('document.created_by_user_id = :userId', { userId }).orWhere(
            `EXISTS (
                SELECT 1
                FROM document_participant dp
                WHERE dp.document_id = document.id
                  AND dp.user_id = :userId
              )`,
            { userId },
          );
        }),
      )
      .getOne();

    if (!document) {
      throw new NotFoundException('Документ не знайдено');
    }

    return document;
  }

  private assertSequentialParticipants(participants: CreateDocumentParticipantDto[]): void {
    const orders = participants.map(participant => participant.order);
    const sortedOrders = [...orders].sort((left, right) => left - right);

    const uniqueUserIds = new Set(participants.map(participant => participant.userId));
    if (uniqueUserIds.size !== participants.length) {
      throw new BadRequestException('Кожен підписант має бути унікальним');
    }

    const uniqueOrders = new Set(orders);
    if (uniqueOrders.size !== participants.length) {
      throw new BadRequestException('Порядок підписання не може повторюватися');
    }

    for (let index = 0; index < sortedOrders.length; index += 1) {
      if (sortedOrders[index] !== index + 1) {
        throw new BadRequestException(
          'Порядок підписання має починатися з 1 та бути без пропусків',
        );
      }
    }
  }

  private assertSupportedUploadFile(
    mimeType: string,
    sizeBytes: number,
    originalFileName: string,
  ): void {
    if (sizeBytes > 40 * 1024 * 1024) {
      throw new BadRequestException('Файл не може бути більший за 40 МБ');
    }

    const allowedMimeTypes = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ]);

    const allowedExtensions = new Set(['pdf', 'docx', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']);
    const extension = originalFileName.split('.').pop()?.toLowerCase() ?? '';

    if (!allowedMimeTypes.has(mimeType) && !allowedExtensions.has(extension)) {
      throw new BadRequestException('Дозволені тільки PDF, DOCX та зображення');
    }
  }

  private sanitizeFileName(fileName: string): string {
    return sanitizeFilename(fileName).trim().slice(0, 120) || 'file';
  }

  private normalizeUploadedFileName(fileName: string): string {
    const trimmed = fileName.trim();
    const decodedFromLatin1 = Buffer.from(trimmed, 'latin1').toString('utf8');

    if (decodedFromLatin1 === trimmed) {
      return trimmed;
    }

    if (this.getFileNameTextScore(decodedFromLatin1) > this.getFileNameTextScore(trimmed)) {
      return decodedFromLatin1;
    }

    return trimmed;
  }

  private getFileNameTextScore(value: string): number {
    const cyrillicMatches = value.match(/[\u0400-\u04FF]/g)?.length ?? 0;
    const asciiLetters = value.match(/[A-Za-z]/g)?.length ?? 0;
    const suspiciousMarkers = value.match(/[ÃÂÐÑâ€™�]/g)?.length ?? 0;

    return cyrillicMatches * 3 + asciiLetters - suspiciousMarkers * 4;
  }
}
