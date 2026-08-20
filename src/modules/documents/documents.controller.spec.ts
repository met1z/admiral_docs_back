import { DocumentsController } from './documents.controller';
import { DocumentQueryDto } from './dto/document-query.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { Role } from '../users/user-role.enum';
import { DocumentParticipantType } from './enums/document-participant-type.enum';
import { DocumentFileDto } from './dto/document-file.dto';
import { AddDocumentCommentDto } from './dto/add-document-comment.dto';

describe('DocumentsController', () => {
  let controller: DocumentsController;
  let documentsService: {
    listTypes: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    getDetail: jest.Mock;
    getFileViewUrl: jest.Mock;
    getFileDownloadUrl: jest.Mock;
    updateName: jest.Mock;
    updateFile: jest.Mock;
    addComment: jest.Mock;
    refundDocument: jest.Mock;
    deleteDocument: jest.Mock;
    signParticipant: jest.Mock;
    rejectParticipant: jest.Mock;
    sendForAdditionalApproval: jest.Mock;
    resubmit: jest.Mock;
  };

  const user: AuthenticatedUser = {
    userId: 1,
    email: 'owner@test.com',
    role: Role.USER,
  };

  beforeEach(() => {
    documentsService = {
      listTypes: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      getDetail: jest.fn(),
      getFileViewUrl: jest.fn(),
      getFileDownloadUrl: jest.fn(),
      updateName: jest.fn(),
      updateFile: jest.fn(),
      addComment: jest.fn(),
      refundDocument: jest.fn(),
      deleteDocument: jest.fn(),
      signParticipant: jest.fn(),
      rejectParticipant: jest.fn(),
      sendForAdditionalApproval: jest.fn(),
      resubmit: jest.fn(),
    };

    controller = new DocumentsController(documentsService as any);
  });

  it('delegates list requests to the service', async () => {
    const query = { page: 1, requiresAction: true } as DocumentQueryDto;

    await controller.list(query, user);

    expect(documentsService.list).toHaveBeenCalledWith(query, user);
  });

  it('delegates creation to the service', async () => {
    const dto = {
      typeId: 1,
      name: 'Doc',
      file: {
        mimeType: 'text/plain',
        url: 'https://cdn.example/file.txt',
        storageKey: 'key',
        originalFileName: 'file.txt',
        sizeBytes: 10,
      } as DocumentFileDto,
      participants: [
        {
          userId: 2,
          participantType: DocumentParticipantType.SIGNER,
          order: 1,
        },
      ],
    };

    await controller.create(dto as any, user);

    expect(documentsService.create).toHaveBeenCalledWith(dto, user);
  });

  it('returns file URLs via service helpers', async () => {
    documentsService.getFileViewUrl.mockResolvedValue({ url: 'https://cdn.example/file.txt' });
    documentsService.getFileDownloadUrl.mockResolvedValue({ url: 'https://cdn.example/file.txt' });

    await controller.getViewUrl(10, user);
    await controller.getDownloadUrl(10, user);

    expect(documentsService.getFileViewUrl).toHaveBeenCalledWith(10, user);
    expect(documentsService.getFileDownloadUrl).toHaveBeenCalledWith(10, user);
  });

  it('delegates signing and rejection to the service', async () => {
    await controller.sign(10, 20, user);
    await controller.reject(10, 20, { reason: 'Nope' } as any, user);
    await controller.additionalApproval(10, 20, { userIds: [2] } as any, user);

    expect(documentsService.signParticipant).toHaveBeenCalledWith(10, 20, user);
    expect(documentsService.rejectParticipant).toHaveBeenCalledWith(10, 20, { reason: 'Nope' }, user);
    expect(documentsService.sendForAdditionalApproval).toHaveBeenCalledWith(10, 20, { userIds: [2] }, user);
  });

  it('delegates comments to the service', async () => {
    const dto = { comment: 'Looks good to me' };

    await controller.addComment(10, dto as AddDocumentCommentDto, user);

    expect(documentsService.addComment).toHaveBeenCalledWith(10, dto, user);
  });

  it('delegates refund, resubmit and delete to the service', async () => {
    await controller.refund(10, user);
    await controller.resubmit(10, user);
    await controller.delete(10, user);

    expect(documentsService.refundDocument).toHaveBeenCalledWith(10, user);
    expect(documentsService.resubmit).toHaveBeenCalledWith(10, user);
    expect(documentsService.deleteDocument).toHaveBeenCalledWith(10, user);
  });
});
