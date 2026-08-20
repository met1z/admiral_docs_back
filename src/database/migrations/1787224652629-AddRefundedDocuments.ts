import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefundedDocuments1787224652629 implements MigrationInterface {
  name = 'AddRefundedDocuments1787224652629';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "document" ADD "refunded_by_user_id" integer`);
    await queryRunner.query(`ALTER TABLE "document" ADD "refunded_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `ALTER TYPE "public"."document_status_enum" RENAME TO "document_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."document_status_enum" AS ENUM('in_progress', 'rejected', 'completed', 'refunded')`,
    );
    await queryRunner.query(`ALTER TABLE "document" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "document" ALTER COLUMN "status" TYPE "public"."document_status_enum" USING "status"::"text"::"public"."document_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document" ALTER COLUMN "status" SET DEFAULT 'in_progress'`,
    );
    await queryRunner.query(`DROP TYPE "public"."document_status_enum_old"`);
    await queryRunner.query(
      `ALTER TYPE "public"."document_history_event_event_type_enum" RENAME TO "document_history_event_event_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."document_history_event_event_type_enum" AS ENUM('created', 'deleted', 'name_replaced', 'file_replaced', 'sent_for_signing', 'signed', 'sent_for_additional_approval', 'additional_approval_rejected', 'additional_approval_accepted', 'rejected', 'returned_for_revision', 'resubmitted', 'completed', 'comment_added', 'refunded')`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_history_event" ALTER COLUMN "event_type" TYPE "public"."document_history_event_event_type_enum" USING "event_type"::"text"::"public"."document_history_event_event_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."document_history_event_event_type_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."document_history_event_event_type_enum_old" AS ENUM('created', 'deleted', 'name_replaced', 'file_replaced', 'sent_for_signing', 'signed', 'sent_for_additional_approval', 'additional_approval_rejected', 'additional_approval_accepted', 'rejected', 'returned_for_revision', 'resubmitted', 'completed', 'comment_added')`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_history_event" ALTER COLUMN "event_type" TYPE "public"."document_history_event_event_type_enum_old" USING "event_type"::"text"::"public"."document_history_event_event_type_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."document_history_event_event_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."document_history_event_event_type_enum_old" RENAME TO "document_history_event_event_type_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."document_status_enum_old" AS ENUM('in_progress', 'rejected', 'completed')`,
    );
    await queryRunner.query(`ALTER TABLE "document" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "document" ALTER COLUMN "status" TYPE "public"."document_status_enum_old" USING "status"::"text"::"public"."document_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document" ALTER COLUMN "status" SET DEFAULT 'in_progress'`,
    );
    await queryRunner.query(`DROP TYPE "public"."document_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."document_status_enum_old" RENAME TO "document_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "document" DROP COLUMN "refunded_at"`);
    await queryRunner.query(`ALTER TABLE "document" DROP COLUMN "refunded_by_user_id"`);
  }
}
