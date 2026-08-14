import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DocumentParticipantStatus } from '../enums/document-participant-status.enum';
import { DocumentParticipantType } from '../enums/document-participant-type.enum';

@Entity({ name: 'document_participant' })
export class DocumentParticipantEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'document_id', type: 'int' })
  documentId!: number;

  @Index()
  @Column({ name: 'user_id', type: 'int' })
  userId!: number;

  @Column({ name: 'participant_type', type: 'enum', enum: DocumentParticipantType })
  participantType!: DocumentParticipantType;

  @Column({ name: 'order', type: 'int' })
  order!: number;

  @Column({ name: 'added_by_user_id', type: 'int', nullable: true })
  addedByUserId!: number | null;

  @Column({ name: 'is_preserved_after_rejection', type: 'boolean', default: false })
  isPreservedAfterRejection!: boolean;

  @Index()
  @Column({ name: 'signed_status', type: 'enum', enum: DocumentParticipantStatus, default: DocumentParticipantStatus.PENDING })
  signedStatus!: DocumentParticipantStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

