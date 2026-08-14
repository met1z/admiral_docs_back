import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocuments1786671181422 implements MigrationInterface {
  name = 'AddDocuments1786671181422';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."document_status_enum" AS ENUM('in_progress', 'rejected', 'completed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "document" ("id" SERIAL NOT NULL, "type_id" integer NOT NULL, "created_by_user_id" integer NOT NULL, "name" character varying(255) NOT NULL, "status" "public"."document_status_enum" NOT NULL DEFAULT 'in_progress', "submission_round" integer NOT NULL DEFAULT '1', "last_rejection_reason" text, "last_rejected_by_user_id" integer, "last_rejected_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e57d3357f83f3cdc0acffc3d777" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2e1aa55eac1947ddf3221506ed" ON "document" ("type_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3cd4c14a428c8fd92fc9262977" ON "document" ("created_by_user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "document_type" ("id" SERIAL NOT NULL, "name" character varying(255) NOT NULL, "code" character varying(100) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2e1aa55eac1947ddf3221506edb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8736291c18c1dda6cb8918bbc1" ON "document_type" ("code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."document_history_event_event_type_enum" AS ENUM('created', 'deleted', 'name_replaced', 'file_replaced', 'sent_for_signing', 'signed', 'sent_for_additional_approval', 'additional_approval_rejected', 'additional_approval_accepted', 'rejected', 'returned_for_revision', 'resubmitted', 'completed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "document_history_event" ("id" SERIAL NOT NULL, "document_id" integer NOT NULL, "actor_user_id" integer NOT NULL, "participant_id" integer, "target_user_id" integer, "event_type" "public"."document_history_event_event_type_enum" NOT NULL, "message" text, "reason" text, "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cc935792ff251cbcdf9b075b89a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_affe23beb5a8ef98efd2c83102" ON "document_history_event" ("document_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "document_file" ("id" SERIAL NOT NULL, "document_id" integer NOT NULL, "mime_type" character varying(255) NOT NULL, "is_current" boolean NOT NULL DEFAULT false, "url" text NOT NULL, "original_file_name" character varying(255) NOT NULL, "size_bytes" bigint NOT NULL, CONSTRAINT "PK_b9e7d1916962b81f2c3b5b54804" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_451c4ffa00abea5f7e548c9103" ON "document_file" ("document_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."document_participant_participant_type_enum" AS ENUM('signer', 'additional_approver')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."document_participant_signed_status_enum" AS ENUM('pending', 'completed', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "document_participant" ("id" SERIAL NOT NULL, "document_id" integer NOT NULL, "user_id" integer NOT NULL, "participant_type" "public"."document_participant_participant_type_enum" NOT NULL, "order" integer NOT NULL, "added_by_user_id" integer, "is_preserved_after_rejection" boolean NOT NULL DEFAULT false, "signed_status" "public"."document_participant_signed_status_enum" NOT NULL DEFAULT 'pending', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_70c4255e1e9499e8fbb0730be0d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_de57fc8470e60a98da0280bad3" ON "document_participant" ("document_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5796ba1260e793ac5a7ff1723f" ON "document_participant" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_abecfb951a10abc7dd6bcb9de0" ON "document_participant" ("signed_status") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_abecfb951a10abc7dd6bcb9de0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5796ba1260e793ac5a7ff1723f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_de57fc8470e60a98da0280bad3"`);
    await queryRunner.query(`DROP TABLE "document_participant"`);
    await queryRunner.query(`DROP TYPE "public"."document_participant_signed_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."document_participant_participant_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_451c4ffa00abea5f7e548c9103"`);
    await queryRunner.query(`DROP TABLE "document_file"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_affe23beb5a8ef98efd2c83102"`);
    await queryRunner.query(`DROP TABLE "document_history_event"`);
    await queryRunner.query(`DROP TYPE "public"."document_history_event_event_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8736291c18c1dda6cb8918bbc1"`);
    await queryRunner.query(`DROP TABLE "document_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3cd4c14a428c8fd92fc9262977"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2e1aa55eac1947ddf3221506ed"`);
    await queryRunner.query(`DROP TABLE "document"`);
    await queryRunner.query(`DROP TYPE "public"."document_status_enum"`);
  }
}
