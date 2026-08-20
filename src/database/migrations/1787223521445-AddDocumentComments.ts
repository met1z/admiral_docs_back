import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentComments1787223521445 implements MigrationInterface {
  name = 'AddDocumentComments1787223521445';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "document_comment" ("id" SERIAL NOT NULL, "document_id" integer NOT NULL, "actor_user_id" integer NOT NULL, "message" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d0c22201afddff485457db0eb3e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ebba8a9c2ec97a667e12a622fa" ON "document_comment" ("document_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_28fec1efcf509aac56f3d9222f" ON "document_comment" ("actor_user_id") `,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."document_history_event_event_type_enum" RENAME TO "document_history_event_event_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."document_history_event_event_type_enum" AS ENUM('created', 'deleted', 'name_replaced', 'file_replaced', 'sent_for_signing', 'signed', 'sent_for_additional_approval', 'additional_approval_rejected', 'additional_approval_accepted', 'rejected', 'returned_for_revision', 'resubmitted', 'completed', 'comment_added')`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_history_event" ALTER COLUMN "event_type" TYPE "public"."document_history_event_event_type_enum" USING "event_type"::"text"::"public"."document_history_event_event_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."document_history_event_event_type_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."document_history_event_event_type_enum_old" AS ENUM('created', 'deleted', 'name_replaced', 'file_replaced', 'sent_for_signing', 'signed', 'sent_for_additional_approval', 'additional_approval_rejected', 'additional_approval_accepted', 'rejected', 'returned_for_revision', 'resubmitted', 'completed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_history_event" ALTER COLUMN "event_type" TYPE "public"."document_history_event_event_type_enum_old" USING "event_type"::"text"::"public"."document_history_event_event_type_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."document_history_event_event_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."document_history_event_event_type_enum_old" RENAME TO "document_history_event_event_type_enum"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_28fec1efcf509aac56f3d9222f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ebba8a9c2ec97a667e12a622fa"`);
    await queryRunner.query(`DROP TABLE "document_comment"`);
  }
}
