import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateDocumentDto } from './dto/create-document.dto';
import { AddDocumentCommentDto } from './dto/add-document-comment.dto';
import { DocumentQueryDto } from './dto/document-query.dto';
import { RejectParticipantDto } from './dto/reject-participant.dto';
import { SendAdditionalApprovalDto } from './dto/send-additional-approval.dto';
import { UpdateDocumentFileDto } from './dto/update-document-file.dto';
import { UpdateDocumentNameDto } from './dto/update-document-name.dto';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('storage/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 40 * 1024 * 1024,
      },
    }),
  )
  uploadStorageFile(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.uploadStorageFile(file, user);
  }

  @Get('types')
  listTypes() {
    return this.documentsService.listTypes();
  }

  @Get()
  list(@Query() query: DocumentQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.list(query, user);
  }

  @Post()
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.create(dto, user);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.getDetail(id, user.userId);
  }

  @Get(':id/file/view')
  getViewUrl(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.getFileViewUrl(id, user);
  }

  @Get(':id/file/download')
  getDownloadUrl(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.getFileDownloadUrl(id, user);
  }

  @Patch(':id/name')
  updateName(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentNameDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.updateName(id, dto, user);
  }

  @Patch(':id/file')
  updateFile(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.updateFile(id, dto, user);
  }

  @Post(':id/comments')
  addComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddDocumentCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.addComment(id, dto, user);
  }

  @Post(':id/refund')
  refund(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.refundDocument(id, user);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.deleteDocument(id, user);
  }

  @Get(':id/history')
  detailHistory(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.getDetail(id, user.userId).then((detail) => detail.history);
  }

  @Get(':id/participants')
  detailParticipants(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.getDetail(id, user.userId).then((detail) => detail.participants);
  }

  @Post(':documentId/participants/:participantId/sign')
  sign(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Param('participantId', ParseIntPipe) participantId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.signParticipant(documentId, participantId, user);
  }

  @Post(':documentId/participants/:participantId/reject')
  reject(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Param('participantId', ParseIntPipe) participantId: number,
    @Body() dto: RejectParticipantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.rejectParticipant(documentId, participantId, dto, user);
  }

  @Post(':documentId/participants/:participantId/additional-approval')
  additionalApproval(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Param('participantId', ParseIntPipe) participantId: number,
    @Body() dto: SendAdditionalApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.sendForAdditionalApproval(documentId, participantId, dto, user);
  }

  @Post(':id/resubmit')
  resubmit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.resubmit(id, user);
  }
}
