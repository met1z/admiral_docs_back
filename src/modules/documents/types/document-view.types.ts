import { DocumentHistoryEventType } from '../enums/document-history-event-type.enum';
import { DocumentParticipantStatus } from '../enums/document-participant-status.enum';
import { DocumentParticipantType } from '../enums/document-participant-type.enum';
import { DocumentStatus } from '../enums/document-status.enum';

export type DocumentRevisionType = 'new' | 'repeat';

export type DocumentListItem = {
  id: number;
  typeId: number;
  typeName: string | null;
  createdByUserId: number;
  createdByFullName: string;
  name: string;
  status: DocumentStatus;
  revisionType: DocumentRevisionType;
  submissionRound: number;
  lastRejectionReason: string | null;
  lastRejectedByUserId: number | null;
  lastRejectedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  requiresAction: boolean;
  myParticipantId: number | null;
  myParticipantStatus: DocumentParticipantStatus | null;
  myParticipantType: DocumentParticipantType | null;
  currentActionFullName: string | null;
};

export type DocumentHistoryEventView = {
  id: number;
  actorUserId: number;
  actorFullName: string;
  participantId: number | null;
  targetUserId: number | null;
  targetFullName: string | null;
  eventType: DocumentHistoryEventType;
  message: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type DocumentParticipantView = {
  id: number;
  userId: number;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  participantType: DocumentParticipantType;
  order: number;
  addedByUserId: number | null;
  isPreservedAfterRejection: boolean;
  signedStatus: DocumentParticipantStatus;
  createdAt: Date;
  updatedAt: Date;
  isCurrentAction: boolean;
};

export type DocumentDetailView = {
  id: number;
  typeId: number;
  typeName: string | null;
  createdByUserId: number;
  createdByFullName: string;
  name: string;
  status: DocumentStatus;
  revisionType: DocumentRevisionType;
  submissionRound: number;
  lastRejectionReason: string | null;
  lastRejectedByUserId: number | null;
  lastRejectedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  currentFile: {
    id: number;
    storageKey: string | null;
    mimeType: string;
    isCurrent: boolean;
    url: string;
    originalFileName: string;
    sizeBytes: string;
    previewUrl: string | null;
    downloadUrl: string | null;
  } | null;
  participants: DocumentParticipantView[];
  history: DocumentHistoryEventView[];
  requiresAction: boolean;
  myParticipantId: number | null;
  myParticipantStatus: DocumentParticipantStatus | null;
  myParticipantType: DocumentParticipantType | null;
  currentActionFullName: string | null;
};
