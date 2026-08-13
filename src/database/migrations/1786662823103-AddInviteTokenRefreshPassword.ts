import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInviteTokenRefreshPassword1786662823103 implements MigrationInterface {
  name = 'AddInviteTokenRefreshPassword1786662823103';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "password_reset_tokens" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "token" character varying(36) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ab673f0e63eac966762155508e" ON "password_reset_tokens" ("token") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."invite_tokens_role_enum" AS ENUM('ADMIN', 'USER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "invite_tokens" ("id" SERIAL NOT NULL, "email" character varying(320) NOT NULL, "token" character varying(36) NOT NULL, "role" "public"."invite_tokens_role_enum" NOT NULL DEFAULT 'USER', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5a05a43816424a1abac69e1f8a5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1b428e1defa2fd21e8f770e93f" ON "invite_tokens" ("token") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_1b428e1defa2fd21e8f770e93f"`);
    await queryRunner.query(`DROP TABLE "invite_tokens"`);
    await queryRunner.query(`DROP TYPE "public"."invite_tokens_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ab673f0e63eac966762155508e"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
  }
}
