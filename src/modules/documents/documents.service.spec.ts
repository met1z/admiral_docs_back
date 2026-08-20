import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { Role } from '../users/user-role.enum';
import { UserEntity } from '../users/user.entity';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { AddDocumentCommentDto } from './dto/add-document-comment.dto';
import { DocumentFileDto } from './dto/document-file.dto';
import { DocumentQueryDto, DocumentSortBy } from './dto/document-query.dto';
import { RejectParticipantDto } from './dto/reject-participant.dto';
import { SendAdditionalApprovalDto } from './dto/send-additional-approval.dto';
import { UpdateDocumentFileDto } from './dto/update-document-file.dto';
import { UpdateDocumentNameDto } from './dto/update-document-name.dto';
import { DocumentHistoryEventType } from './enums/document-history-event-type.enum';
import { DocumentParticipantStatus } from './enums/document-participant-status.enum';
import { DocumentParticipantType } from './enums/document-participant-type.enum';
import { DocumentStatus } from './enums/document-status.enum';

type RepoMock<T> = {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  delete: jest.Mock;
  createQueryBuilder: jest.Mock;
};

type QbMock = {
  where: jest.Mock;
  andWhere: jest.Mock;
  leftJoin: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  addSelect: jest.Mock;
  setParameter: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  select: jest.Mock;
  getRawMany: jest.Mock;
  getOne: jest.Mock;
  getCount: jest.Mock;
  clone: jest.Mock;
  delete: jest.Mock;
  from: jest.Mock;
  execute: jest.Mock;
};

const createRepoMock = <T,>(): RepoMock<T> => ({
  create: jest.fn((value) => value),
  save: jest.fn(async (value) => value),
  find: jest.fn(),
  findOne: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const createQbMock = (): { qb: QbMock; countQb: QbMock } => {
  const countQb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getOne: jest.fn(),
    getCount: jest.fn(),
    clone: jest.fn(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  } as unknown as QbMock;

  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getOne: jest.fn(),
    getCount: jest.fn(),
    clone: jest.fn(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  } as unknown as QbMock;

  qb.clone.mockReturnValue(countQb);

  return { qb, countQb };
};

const makeUser = (
  id: number,
  firstName: string,
  lastName: string,
  email: string,
): UserEntity =>
  ({
    id,
    firstName,
    lastName,
    email,
    role: Role.USER,
  }) as UserEntity;

const actor: AuthenticatedUser = {
  userId: 1,
  email: 'owner@test.com',
  role: Role.USER,
};

describe('DocumentsService', () => {
  let service: DocumentsService;
  let documentTypesRepository: RepoMock<unknown>;
  let documentsRepository: RepoMock<unknown>;
  let documentCommentsRepository: RepoMock<unknown>;
  let documentFilesRepository: RepoMock<unknown>;
  let documentParticipantsRepository: RepoMock<unknown>;
  let documentHistoryEventsRepository: RepoMock<unknown>;
  let usersService: { findById: jest.Mock; findByIds: jest.Mock };
  let r2StorageService: { uploadBuffer: jest.Mock; deleteObject: jest.Mock; createSignedGetUrl: jest.Mock };
  let qb: QbMock;
  let countQb: QbMock;

  const users = new Map<number, UserEntity>();

  beforeEach(() => {
    documentTypesRepository = createRepoMock();
    documentsRepository = createRepoMock();
    documentCommentsRepository = createRepoMock();
    documentFilesRepository = createRepoMock();
    documentParticipantsRepository = createRepoMock();
    documentHistoryEventsRepository = createRepoMock();
    usersService = {
      findById: jest.fn(async (id: number) => {
        const user = users.get(id);
        if (!user) {
          throw new Error(`User ${id} not found`);
        }
        return user;
      }),
      findByIds: jest.fn(async (ids: number[]) => ids.map((id) => {
        const user = users.get(id);
        if (!user) {
          throw new Error(`User ${id} not found`);
        }
        return user;
      })),
    };
    r2StorageService = {
      uploadBuffer: jest.fn(),
      deleteObject: jest.fn(),
      createSignedGetUrl: jest.fn(async (input: { key: string; disposition: string }) =>
        `signed://${input.disposition}/${input.key}`,
      ),
    };

    users.clear();
    users.set(1, makeUser(1, 'Owner', 'One', 'owner@test.com'));
    users.set(2, makeUser(2, 'Signer', 'Two', 'signer@test.com'));
    users.set(3, makeUser(3, 'Approver', 'Three', 'approver@test.com'));
    users.set(4, makeUser(4, 'Reviewer', 'Four', 'reviewer@test.com'));
    users.set(5, makeUser(5, 'Second', 'Signer', 'second@test.com'));
    users.set(6, makeUser(6, 'Extra', 'Person', 'extra@test.com'));

    const qbPair = createQbMock();
    qb = qbPair.qb;
    countQb = qbPair.countQb;
    documentsRepository.createQueryBuilder.mockReturnValue(qb as any);
    documentParticipantsRepository.createQueryBuilder.mockReturnValue(qb as any);
    documentCommentsRepository.find.mockResolvedValue([]);

    service = new DocumentsService(
      documentTypesRepository as unknown as Repository<any>,
      documentsRepository as unknown as Repository<any>,
      documentCommentsRepository as unknown as Repository<any>,
      documentFilesRepository as unknown as Repository<any>,
      documentParticipantsRepository as unknown as Repository<any>,
      documentHistoryEventsRepository as unknown as Repository<any>,
      r2StorageService as unknown as any,
      usersService as unknown as any,
    );
  });

  it('sorts document types by sortOrder and id', async () => {
    documentTypesRepository.find.mockResolvedValue([
      { id: 3, name: 'B', sortOrder: 2 },
      { id: 1, name: 'A', sortOrder: 1 },
      { id: 2, name: 'C', sortOrder: 1 },
    ]);

    const result = await service.listTypes();

    expect(documentTypesRepository.find).toHaveBeenCalledWith({
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    expect(result.map((item: { id: number }) => item.id)).toEqual([3, 1, 2]);
  });

  it('lists documents with current action metadata in a single query', async () => {
    const currentUser = { ...actor };

    qb.getRawMany.mockResolvedValue([
      {
        document_id: 100,
        document_type_id: 10,
        document_created_by_user_id: 1,
        document_name: 'Main contract',
        document_status: DocumentStatus.IN_PROGRESS,
        document_submission_round: 1,
        document_last_rejection_reason: null,
        document_last_rejected_by_user_id: null,
        document_last_rejected_at: null,
        document_completed_at: null,
        document_created_at: new Date('2026-08-14T10:00:00Z'),
        document_updated_at: new Date('2026-08-14T10:00:00Z'),
        document_type_name: 'Contract',
        creator_first_name: 'Owner',
        creator_last_name: 'One',
        creator_email: 'owner@test.com',
        current_action_user_id: 2,
        current_action_first_name: 'Signer',
        current_action_last_name: 'Two',
        current_action_email: 'signer@test.com',
      },
    ]);
    countQb.getCount.mockResolvedValue(1);

    const result = await service.list({ page: 1, limit: 10 } as DocumentQueryDto, currentUser);

    expect(documentParticipantsRepository.find).not.toHaveBeenCalled();
    expect(usersService.findById).not.toHaveBeenCalled();
    expect(qb.setParameter).toHaveBeenCalledWith('additionalApproverType', DocumentParticipantType.ADDITIONAL_APPROVER);
    const currentActionJoin = qb.leftJoin.mock.calls.find(([, alias]) => alias === 'current_action_participant');
    expect(currentActionJoin?.[2]).toContain('CASE');
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 100,
        currentActionFullName: 'Signer Two',
        requiresAction: false,
      }),
    );
  });

  it('filters documents requiring the current user action', async () => {
    const currentUser = { ...actor, userId: 2, email: 'signer@test.com' };

    qb.getRawMany.mockResolvedValue([]);
    countQb.getCount.mockResolvedValue(0);

    await service.list({ page: 1, requiresAction: true } as DocumentQueryDto, currentUser);

    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('current_action_user.id = :currentUserId'),
      expect.objectContaining({ currentUserId: 2 }),
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('document.status IN (:...requiresActionStatuses)'),
      expect.objectContaining({ requiresActionStatuses: [DocumentStatus.REJECTED, DocumentStatus.REFUNDED] }),
    );
  });

  it('marks rejected creator documents as requiring action in the list', async () => {
    const currentUser = { ...actor };

    qb.getRawMany.mockResolvedValue([
      {
        document_id: 100,
        document_type_id: 10,
        document_created_by_user_id: 1,
        document_name: 'Returned doc',
        document_status: DocumentStatus.REJECTED,
        document_submission_round: 1,
        document_last_rejection_reason: 'Need fixes',
        document_last_rejected_by_user_id: 2,
        document_last_rejected_at: new Date('2026-08-14T10:00:00Z'),
        document_completed_at: null,
        document_refunded_by_user_id: null,
        document_refunded_at: null,
        document_created_at: new Date('2026-08-14T10:00:00Z'),
        document_updated_at: new Date('2026-08-14T10:00:00Z'),
        document_type_name: 'Contract',
        creator_first_name: 'Owner',
        creator_last_name: 'One',
        creator_email: 'owner@test.com',
        current_action_user_id: null,
        current_action_first_name: null,
        current_action_last_name: null,
        current_action_email: null,
      },
    ]);
    countQb.getCount.mockResolvedValue(1);

    const result = await service.list({ page: 1, requiresAction: true } as DocumentQueryDto, currentUser);

    expect(result.items[0]?.requiresAction).toBe(true);
  });

  it('uploads a supported file to R2 and rejects invalid files', async () => {
    r2StorageService.uploadBuffer.mockResolvedValue({
      key: 'documents/tmp/1/file.pdf',
      publicUrl: 'https://public.example/documents/tmp/1/file.pdf',
    });

    const uploaded = await service.uploadStorageFile(
      {
        buffer: Buffer.from('hello'),
        mimetype: 'application/pdf',
        originalname: 'file.pdf',
        size: 12,
      } as Express.Multer.File,
      actor,
    );

    expect(r2StorageService.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining('documents/tmp/1/'),
        mimeType: 'application/pdf',
        fileName: 'file.pdf',
      }),
    );
    expect(uploaded).toEqual(
      expect.objectContaining({
        mimeType: 'application/pdf',
        storageKey: 'documents/tmp/1/file.pdf',
        url: 'https://public.example/documents/tmp/1/file.pdf',
        originalFileName: 'file.pdf',
      }),
    );

    await expect(
      service.uploadStorageFile(
        {
          buffer: Buffer.from('x'),
          mimetype: 'application/x-msdownload',
          originalname: 'doc.exe',
          size: 4,
        } as Express.Multer.File,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a document with files, participants, and history events', async () => {
    documentTypesRepository.findOne.mockResolvedValue({
      id: 10,
      name: 'Contract',
      code: 'contract',
      sortOrder: 1,
    });

    const savedDocument = {
      id: 100,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Main contract',
      status: DocumentStatus.IN_PROGRESS,
      submissionRound: 1,
      lastRejectionReason: null,
      lastRejectedByUserId: null,
      lastRejectedAt: null,
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };
    documentsRepository.save.mockResolvedValue(savedDocument);

    const currentFile = {
      id: 200,
      documentId: savedDocument.id,
      storageKey: 'documents/1/file.txt',
      mimeType: 'text/plain',
      isCurrent: true,
      url: 'https://cdn.example/file.txt',
      originalFileName: 'file.txt',
      sizeBytes: '10',
    };
    documentFilesRepository.save.mockResolvedValue(currentFile);

    const participants = [
      {
        id: 300,
        documentId: savedDocument.id,
        userId: 2,
        participantType: DocumentParticipantType.SIGNER,
        order: 1,
        addedByUserId: actor.userId,
        isPreservedAfterRejection: false,
        signedStatus: DocumentParticipantStatus.PENDING,
        createdAt: new Date('2026-08-14T10:00:00Z'),
        updatedAt: new Date('2026-08-14T10:00:00Z'),
      },
      {
        id: 301,
        documentId: savedDocument.id,
        userId: 3,
        participantType: DocumentParticipantType.SIGNER,
        order: 2,
        addedByUserId: actor.userId,
        isPreservedAfterRejection: false,
        signedStatus: DocumentParticipantStatus.PENDING,
        createdAt: new Date('2026-08-14T10:00:00Z'),
        updatedAt: new Date('2026-08-14T10:00:00Z'),
      },
    ];
    documentParticipantsRepository.save.mockResolvedValue(participants);
    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(savedDocument);
    documentFilesRepository.findOne.mockResolvedValue(currentFile);
    documentParticipantsRepository.find.mockResolvedValue(participants);
    documentHistoryEventsRepository.find.mockResolvedValue([]);

    const result = await service.create(
      {
        typeId: 10,
        name: 'Main contract',
        file: {
          mimeType: 'text/plain',
          url: 'https://cdn.example/file.txt',
          storageKey: 'documents/1/file.txt',
          originalFileName: 'file.txt',
          sizeBytes: 10,
        } as DocumentFileDto,
        participants: [
          { userId: 2, participantType: DocumentParticipantType.SIGNER, order: 1 },
          { userId: 3, participantType: DocumentParticipantType.SIGNER, order: 2 },
        ],
      } as CreateDocumentDto,
      actor,
    );

    expect(documentTypesRepository.findOne).toHaveBeenCalledWith({ where: { id: 10 } });
    expect(documentFilesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: 'documents/1/file.txt',
        isCurrent: true,
      }),
    );
    expect(documentParticipantsRepository.save).toHaveBeenCalledTimes(1);
    expect(documentHistoryEventsRepository.save).toHaveBeenCalledTimes(2);
    expect(result).toEqual(
      expect.objectContaining({
        id: savedDocument.id,
        name: 'Main contract',
        currentFile: expect.objectContaining({
          url: 'https://cdn.example/file.txt',
          previewUrl: 'signed://inline/documents/1/file.txt',
          downloadUrl: 'signed://attachment/documents/1/file.txt',
        }),
        participants: expect.arrayContaining([
          expect.objectContaining({ userEmail: 'signer@test.com' }),
          expect.objectContaining({ userEmail: 'approver@test.com' }),
        ]),
      }),
    );
  });

  it('denies access to documents for non participants and non creators', async () => {
    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(null);

    await expect(service.getDetail(999, 4)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates document name only for creator in rejected status', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Old name',
      status: DocumentStatus.REJECTED,
      submissionRound: 1,
      lastRejectionReason: 'Fix it',
      lastRejectedByUserId: 2,
      lastRejectedAt: new Date('2026-08-14T10:00:00Z'),
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentsRepository.save.mockImplementation(async (value) => value);
    documentTypesRepository.findOne.mockResolvedValue({ id: 10, name: 'Type', code: 'type', sortOrder: 1 });
    documentFilesRepository.findOne.mockResolvedValue(null);
    documentParticipantsRepository.find.mockResolvedValue([]);
    documentHistoryEventsRepository.find.mockResolvedValue([]);

    const result = await service.updateName(10, { name: 'New name' } as UpdateDocumentNameDto, actor);

    expect(documentsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'New name' }));
    expect(documentHistoryEventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: DocumentHistoryEventType.NAME_REPLACED,
      }),
    );
    expect(result.name).toBe('New name');
  });

  it('updates file and keeps previous file historical', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.REJECTED,
      submissionRound: 1,
      lastRejectionReason: 'Fix it',
      lastRejectedByUserId: 2,
      lastRejectedAt: new Date('2026-08-14T10:00:00Z'),
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };
    const oldFile = {
      id: 1,
      documentId: 10,
      storageKey: 'old-key',
      mimeType: 'text/plain',
      isCurrent: true,
      url: 'https://cdn.example/old.txt',
      originalFileName: 'old.txt',
      sizeBytes: '10',
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentsRepository.save.mockImplementation(async (value) => value);
    documentFilesRepository.findOne.mockResolvedValue(oldFile);
    documentFilesRepository.save.mockImplementation(async (value) => value);
    documentTypesRepository.findOne.mockResolvedValue({ id: 10, name: 'Type', code: 'type', sortOrder: 1 });
    documentParticipantsRepository.find.mockResolvedValue([]);
    documentHistoryEventsRepository.find.mockResolvedValue([]);

    await service.updateFile(
      10,
      {
        file: {
          mimeType: 'image/png',
          url: 'https://cdn.example/new.png',
          storageKey: 'new-key',
          originalFileName: 'new.png',
          sizeBytes: 42,
        },
      } as UpdateDocumentFileDto,
      actor,
    );

    expect(documentFilesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isCurrent: false, id: 1 }),
    );
    expect(documentFilesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: 'new-key', isCurrent: true }),
    );
    expect(documentHistoryEventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: DocumentHistoryEventType.FILE_REPLACED }),
    );
  });

  it('adds a comment and tracks it in history', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.IN_PROGRESS,
      submissionRound: 1,
      lastRejectionReason: null,
      lastRejectedByUserId: null,
      lastRejectedAt: null,
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentTypesRepository.findOne.mockResolvedValue({ id: 10, name: 'Type', code: 'type', sortOrder: 1 });
    documentFilesRepository.findOne.mockResolvedValue(null);
    documentCommentsRepository.save.mockResolvedValue({
      id: 900,
      documentId: 10,
      actorUserId: actor.userId,
      message: 'Looks good to me',
      createdAt: new Date('2026-08-14T10:00:00Z'),
    });
    documentCommentsRepository.find.mockResolvedValue([
      {
        id: 900,
        documentId: 10,
        actorUserId: actor.userId,
        message: 'Looks good to me',
        createdAt: new Date('2026-08-14T10:00:00Z'),
      },
    ]);
    documentParticipantsRepository.find.mockResolvedValue([]);
    documentHistoryEventsRepository.save.mockImplementation(async (value) => value);
    documentHistoryEventsRepository.find.mockResolvedValue([
      {
        id: 900,
        documentId: 10,
        actorUserId: actor.userId,
        participantId: null,
        targetUserId: null,
        eventType: DocumentHistoryEventType.COMMENT_ADDED,
        message: 'Looks good to me',
        reason: null,
        metadata: null,
        createdAt: new Date('2026-08-14T10:00:00Z'),
      },
    ]);

    const result = await service.addComment(
      10,
      { comment: 'Looks good to me' } as AddDocumentCommentDto,
      actor,
    );

    expect(documentCommentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 10,
        actorUserId: actor.userId,
        message: 'Looks good to me',
      }),
    );
    expect(documentHistoryEventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: DocumentHistoryEventType.COMMENT_ADDED,
        message: 'Looks good to me',
      }),
    );
    expect(result.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: DocumentHistoryEventType.COMMENT_ADDED,
          message: 'Looks good to me',
        }),
      ]),
    );
  });

  it('refunds a document only for the initiator', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.IN_PROGRESS,
      submissionRound: 1,
      lastRejectionReason: null,
      lastRejectedByUserId: null,
      lastRejectedAt: null,
      completedAt: null,
      refundedByUserId: null,
      refundedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentTypesRepository.findOne.mockResolvedValue({ id: 10, name: 'Type', code: 'type', sortOrder: 1 });
    documentFilesRepository.findOne.mockResolvedValue(null);
    documentCommentsRepository.find.mockResolvedValue([]);
    documentParticipantsRepository.find.mockResolvedValue([]);
    documentHistoryEventsRepository.find.mockResolvedValue([]);
    documentsRepository.save.mockImplementation(async (value) => value);

    const result = await service.refundDocument(10, actor);

    expect(documentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DocumentStatus.REFUNDED,
        refundedByUserId: actor.userId,
      }),
    );
    expect(documentHistoryEventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: DocumentHistoryEventType.REFUNDED,
      }),
    );
    expect(result.status).toBe(DocumentStatus.REFUNDED);
  });

  it('does not refund a document when someone has already signed it', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.IN_PROGRESS,
      submissionRound: 1,
      lastRejectionReason: null,
      lastRejectedByUserId: null,
      lastRejectedAt: null,
      completedAt: null,
      refundedByUserId: null,
      refundedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentParticipantsRepository.find.mockResolvedValue([
      {
        id: 1,
        documentId: 10,
        userId: 2,
        participantType: DocumentParticipantType.SIGNER,
        order: 1,
        addedByUserId: actor.userId,
        isPreservedAfterRejection: false,
        signedStatus: DocumentParticipantStatus.COMPLETED,
        createdAt: new Date('2026-08-14T10:00:00Z'),
        updatedAt: new Date('2026-08-14T10:00:00Z'),
      },
    ]);

    await expect(service.refundDocument(10, actor)).rejects.toThrow('Відгукнути можна лише документ без підписів');
    expect(documentsRepository.save).not.toHaveBeenCalled();
    expect(documentHistoryEventsRepository.save).not.toHaveBeenCalled();
  });

  it('deletes refunded document and its R2 file for initiator', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.REFUNDED,
      submissionRound: 1,
      lastRejectionReason: null,
      lastRejectedByUserId: null,
      lastRejectedAt: null,
      refundedByUserId: actor.userId,
      refundedAt: new Date('2026-08-14T10:00:00Z'),
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };
    const currentFile = {
      id: 1,
      documentId: 10,
      storageKey: 'docs/10/file.txt',
      mimeType: 'text/plain',
      isCurrent: true,
      url: 'https://cdn.example/file.txt',
      originalFileName: 'file.txt',
      sizeBytes: '10',
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentFilesRepository.findOne.mockResolvedValue(currentFile);

    const result = await service.deleteDocument(10, actor);

    expect(r2StorageService.deleteObject).toHaveBeenCalledWith('docs/10/file.txt');
    expect(documentFilesRepository.delete).toHaveBeenCalledWith({ documentId: 10 });
    expect(documentParticipantsRepository.delete).toHaveBeenCalledWith({ documentId: 10 });
    expect(documentsRepository.delete).toHaveBeenCalledWith({ id: 10 });
    expect(result).toEqual({ deleted: true });
  });

  it('deletes rejected document for initiator', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.REJECTED,
      submissionRound: 1,
      lastRejectionReason: 'Need changes',
      lastRejectedByUserId: actor.userId,
      lastRejectedAt: new Date('2026-08-14T10:00:00Z'),
      refundedByUserId: null,
      refundedAt: null,
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentFilesRepository.findOne.mockResolvedValue(null);

    const result = await service.deleteDocument(10, actor);

    expect(r2StorageService.deleteObject).not.toHaveBeenCalled();
    expect(documentFilesRepository.delete).toHaveBeenCalledWith({ documentId: 10 });
    expect(documentParticipantsRepository.delete).toHaveBeenCalledWith({ documentId: 10 });
    expect(documentsRepository.delete).toHaveBeenCalledWith({ id: 10 });
    expect(result).toEqual({ deleted: true });
  });

  it('signs current participant and completes the document when it is the last step', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.IN_PROGRESS,
      submissionRound: 1,
      lastRejectionReason: null,
      lastRejectedByUserId: null,
      lastRejectedAt: null,
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };
    const currentParticipant = {
      id: 20,
      documentId: 10,
      userId: 2,
      participantType: DocumentParticipantType.SIGNER,
      order: 1,
      addedByUserId: actor.userId,
      isPreservedAfterRejection: false,
      signedStatus: DocumentParticipantStatus.PENDING,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentParticipantsRepository.find.mockResolvedValue([currentParticipant]);
    documentParticipantsRepository.save.mockImplementation(async (value) => value);
    documentsRepository.save.mockImplementation(async (value) => value);
    documentTypesRepository.findOne.mockResolvedValue({ id: 10, name: 'Type', code: 'type', sortOrder: 1 });
    documentFilesRepository.findOne.mockResolvedValue(null);
    documentHistoryEventsRepository.find.mockResolvedValue([]);

    await service.signParticipant(10, 20, { ...actor, userId: 2, email: 'signer@test.com' });

    expect(documentParticipantsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 20, signedStatus: DocumentParticipantStatus.COMPLETED }),
    );
    expect(documentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DocumentStatus.COMPLETED }),
    );
    expect(documentHistoryEventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: DocumentHistoryEventType.SIGNED }),
    );
    expect(documentHistoryEventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: DocumentHistoryEventType.COMPLETED }),
    );
  });

  it('adds additional approvers and prevents duplicates', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.IN_PROGRESS,
      submissionRound: 1,
      lastRejectionReason: null,
      lastRejectedByUserId: null,
      lastRejectedAt: null,
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };
    const currentParticipant = {
      id: 20,
      documentId: 10,
      userId: 2,
      participantType: DocumentParticipantType.SIGNER,
      order: 1,
      addedByUserId: actor.userId,
      isPreservedAfterRejection: false,
      signedStatus: DocumentParticipantStatus.PENDING,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentParticipantsRepository.find.mockResolvedValue([currentParticipant]);
    documentParticipantsRepository.save.mockImplementation(async (value) => value);
    documentTypesRepository.findOne.mockResolvedValue({ id: 10, name: 'Type', code: 'type', sortOrder: 1 });
    documentFilesRepository.findOne.mockResolvedValue(null);
    documentHistoryEventsRepository.find.mockResolvedValue([]);

    await service.sendForAdditionalApproval(
      10,
      20,
      {
        userIds: [3, 4],
        message: 'Need more approval',
        reason: 'Business check',
      } as SendAdditionalApprovalDto,
      { ...actor, userId: 2, email: 'signer@test.com' },
    );

    expect(documentParticipantsRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 3,
          participantType: DocumentParticipantType.ADDITIONAL_APPROVER,
          addedByUserId: 2,
        }),
        expect.objectContaining({
          userId: 4,
          participantType: DocumentParticipantType.ADDITIONAL_APPROVER,
          addedByUserId: 2,
        }),
      ]),
    );
    expect(documentHistoryEventsRepository.save).toHaveBeenCalledTimes(2);

    documentParticipantsRepository.find.mockResolvedValue([
      currentParticipant,
      {
        id: 31,
        documentId: 10,
        userId: 3,
        participantType: DocumentParticipantType.ADDITIONAL_APPROVER,
        order: 2,
        addedByUserId: 2,
        isPreservedAfterRejection: false,
        signedStatus: DocumentParticipantStatus.PENDING,
        createdAt: new Date('2026-08-14T10:00:00Z'),
        updatedAt: new Date('2026-08-14T10:00:00Z'),
      },
    ]);

    await expect(
      service.sendForAdditionalApproval(
        10,
        20,
        { userIds: [3] } as SendAdditionalApprovalDto,
        { ...actor, userId: 2, email: 'signer@test.com' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not allow adding a participant who is already a signer', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.IN_PROGRESS,
      submissionRound: 1,
      lastRejectionReason: null,
      lastRejectedByUserId: null,
      lastRejectedAt: null,
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };
    const currentParticipant = {
      id: 20,
      documentId: 10,
      userId: 2,
      participantType: DocumentParticipantType.SIGNER,
      order: 1,
      addedByUserId: actor.userId,
      isPreservedAfterRejection: false,
      signedStatus: DocumentParticipantStatus.PENDING,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };
    const anotherSigner = {
      id: 21,
      documentId: 10,
      userId: 3,
      participantType: DocumentParticipantType.SIGNER,
      order: 2,
      addedByUserId: actor.userId,
      isPreservedAfterRejection: false,
      signedStatus: DocumentParticipantStatus.PENDING,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentParticipantsRepository.find.mockResolvedValue([currentParticipant, anotherSigner]);
    documentTypesRepository.findOne.mockResolvedValue({ id: 10, name: 'Type', code: 'type', sortOrder: 1 });
    documentFilesRepository.findOne.mockResolvedValue(null);
    documentHistoryEventsRepository.find.mockResolvedValue([]);

    await expect(
      service.sendForAdditionalApproval(
        10,
        20,
        { userIds: [3], reason: 'Business check' } as SendAdditionalApprovalDto,
        { ...actor, userId: 2, email: 'signer@test.com' },
      ),
    ).rejects.toThrow('Користувач 3 вже є серед підписантів або погоджувачів');
  });

  it('rejects a participant, removes unprotected additional approvers, and resets others', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.IN_PROGRESS,
      submissionRound: 1,
      lastRejectionReason: null,
      lastRejectedByUserId: null,
      lastRejectedAt: null,
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };
    const signer = {
      id: 20,
      documentId: 10,
      userId: 2,
      participantType: DocumentParticipantType.SIGNER,
      order: 1,
      addedByUserId: actor.userId,
      isPreservedAfterRejection: false,
      signedStatus: DocumentParticipantStatus.PENDING,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };
    const extraApprover = {
      id: 21,
      documentId: 10,
      userId: 3,
      participantType: DocumentParticipantType.ADDITIONAL_APPROVER,
      order: 2,
      addedByUserId: 2,
      isPreservedAfterRejection: false,
      signedStatus: DocumentParticipantStatus.PENDING,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentParticipantsRepository.find.mockResolvedValue([signer, extraApprover]);
    documentParticipantsRepository.save.mockImplementation(async (value) => value);
    documentsRepository.save.mockImplementation(async (value) => value);
    documentTypesRepository.findOne.mockResolvedValue({ id: 10, name: 'Type', code: 'type', sortOrder: 1 });
    documentFilesRepository.findOne.mockResolvedValue(null);
    documentHistoryEventsRepository.find.mockResolvedValue([]);

    await service.rejectParticipant(
      10,
      20,
      { reason: 'Not enough data', message: 'Please fix' } as RejectParticipantDto,
      { ...actor, userId: 2, email: 'signer@test.com' },
    );

    expect(qb.delete).toHaveBeenCalled();
    expect(qb.from).toHaveBeenCalled();
    expect(qb.where).toHaveBeenCalledWith('id IN (:...ids)', {
      ids: [21],
    });
    expect(qb.execute).toHaveBeenCalled();
    expect(documentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DocumentStatus.REJECTED,
        lastRejectionReason: 'Not enough data',
        lastRejectedByUserId: 2,
      }),
    );
    expect(documentHistoryEventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: DocumentHistoryEventType.REJECTED }),
    );
    expect(documentHistoryEventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: DocumentHistoryEventType.RETURNED_FOR_REVISION }),
    );
    expect(documentCommentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 10,
        actorUserId: 2,
        message: 'Повернуто: "Not enough data"',
      }),
    );
  });

  it('re-submits rejected documents and increments the submission round', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.REJECTED,
      submissionRound: 1,
      lastRejectionReason: 'Fix it',
      lastRejectedByUserId: 2,
      lastRejectedAt: new Date('2026-08-14T10:00:00Z'),
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };
    const participant = {
      id: 20,
      documentId: 10,
      userId: 2,
      participantType: DocumentParticipantType.SIGNER,
      order: 1,
      addedByUserId: actor.userId,
      isPreservedAfterRejection: false,
      signedStatus: DocumentParticipantStatus.REJECTED,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentParticipantsRepository.find.mockResolvedValue([participant]);
    documentParticipantsRepository.save.mockImplementation(async (value) => value);
    documentsRepository.save.mockImplementation(async (value) => value);
    documentHistoryEventsRepository.find.mockResolvedValue([]);
    documentFilesRepository.findOne.mockResolvedValue(null);
    documentTypesRepository.findOne.mockResolvedValue({ id: 10, name: 'Type', code: 'type', sortOrder: 1 });

    const result = await service.resubmit(10, actor);

    expect(documentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DocumentStatus.IN_PROGRESS,
        submissionRound: 2,
      }),
    );
    expect(documentParticipantsRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ signedStatus: DocumentParticipantStatus.PENDING }),
      ]),
    );
    expect(result.submissionRound).toBe(2);
  });

  it('re-submits refunded documents and increments the submission round', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.REFUNDED,
      submissionRound: 2,
      lastRejectionReason: null,
      lastRejectedByUserId: null,
      lastRejectedAt: null,
      refundedByUserId: 2,
      refundedAt: new Date('2026-08-14T10:00:00Z'),
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };
    const participant = {
      id: 20,
      documentId: 10,
      userId: 2,
      participantType: DocumentParticipantType.SIGNER,
      order: 1,
      addedByUserId: actor.userId,
      isPreservedAfterRejection: false,
      signedStatus: DocumentParticipantStatus.REJECTED,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentParticipantsRepository.find.mockResolvedValue([participant]);
    documentParticipantsRepository.save.mockImplementation(async (value) => value);
    documentsRepository.save.mockImplementation(async (value) => value);
    documentHistoryEventsRepository.find.mockResolvedValue([]);
    documentFilesRepository.findOne.mockResolvedValue(null);
    documentTypesRepository.findOne.mockResolvedValue({ id: 10, name: 'Type', code: 'type', sortOrder: 1 });

    const result = await service.resubmit(10, actor);

    expect(documentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DocumentStatus.IN_PROGRESS,
        submissionRound: 3,
      }),
    );
    expect(documentParticipantsRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ signedStatus: DocumentParticipantStatus.PENDING }),
      ]),
    );
    expect(result.submissionRound).toBe(3);
  });

  it('returns file URLs directly for view and download', async () => {
    const document = {
      id: 10,
      typeId: 10,
      createdByUserId: actor.userId,
      name: 'Doc',
      status: DocumentStatus.IN_PROGRESS,
      submissionRound: 1,
      lastRejectionReason: null,
      lastRejectedByUserId: null,
      lastRejectedAt: null,
      completedAt: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
      updatedAt: new Date('2026-08-14T10:00:00Z'),
    };
    const currentFile = {
      id: 1,
      documentId: 10,
      storageKey: 'docs/10/file.txt',
      mimeType: 'text/plain',
      isCurrent: true,
      url: 'https://cdn.example/file.txt',
      originalFileName: 'file.txt',
      sizeBytes: '10',
    };

    documentsRepository.createQueryBuilder().getOne.mockResolvedValue(document);
    documentFilesRepository.findOne.mockResolvedValue(currentFile);
    documentParticipantsRepository.find.mockResolvedValue([
      {
        id: 20,
        documentId: 10,
        userId: 2,
        participantType: DocumentParticipantType.SIGNER,
        order: 1,
        addedByUserId: actor.userId,
        isPreservedAfterRejection: false,
        signedStatus: DocumentParticipantStatus.PENDING,
        createdAt: new Date('2026-08-14T10:00:00Z'),
        updatedAt: new Date('2026-08-14T10:00:00Z'),
      },
    ]);
    documentHistoryEventsRepository.find.mockResolvedValue([]);
    documentTypesRepository.findOne.mockResolvedValue({ id: 10, name: 'Type', code: 'type', sortOrder: 1 });
    usersService.findById.mockImplementation(async (id: number) => users.get(id)!);

    await expect(service.getFileViewUrl(10, actor)).resolves.toEqual({
      url: 'signed://inline/docs/10/file.txt',
    });
    await expect(service.getFileDownloadUrl(10, actor)).resolves.toEqual({
      url: 'signed://attachment/docs/10/file.txt',
    });
  });
});
