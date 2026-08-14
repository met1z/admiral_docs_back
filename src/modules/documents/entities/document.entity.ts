import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DocumentStatus } from '../enums/document-status.enum';

@Entity({ name: 'document' })
export class DocumentEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'type_id', type: 'int' })
  typeId!: number;

  @Index()
  @Column({ name: 'created_by_user_id', type: 'int' })
  createdByUserId!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.IN_PROGRESS })
  status!: DocumentStatus;

  @Column({ name: 'submission_round', type: 'int', default: 1 })
  submissionRound!: number;

  @Column({ name: 'last_rejection_reason', type: 'text', nullable: true })
  lastRejectionReason!: string | null;

  @Column({ name: 'last_rejected_by_user_id', type: 'int', nullable: true })
  lastRejectedByUserId!: number | null;

  @Column({ name: 'last_rejected_at', type: 'timestamptz', nullable: true })
  lastRejectedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
