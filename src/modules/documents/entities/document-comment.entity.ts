import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'document_comment' })
export class DocumentCommentEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'document_id', type: 'int' })
  documentId!: number;

  @Index()
  @Column({ name: 'actor_user_id', type: 'int' })
  actorUserId!: number;

  @Column({ type: 'text' })
  message!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
