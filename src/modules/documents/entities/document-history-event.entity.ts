import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { DocumentHistoryEventType } from '../enums/document-history-event-type.enum';

@Entity({ name: 'document_history_event' })
export class DocumentHistoryEventEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'document_id', type: 'int' })
  documentId!: number;

  @Column({ name: 'actor_user_id', type: 'int' })
  actorUserId!: number;

  @Column({ name: 'participant_id', type: 'int', nullable: true })
  participantId!: number | null;

  @Column({ name: 'target_user_id', type: 'int', nullable: true })
  targetUserId!: number | null;

  @Column({ name: 'event_type', type: 'enum', enum: DocumentHistoryEventType })
  eventType!: DocumentHistoryEventType;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

