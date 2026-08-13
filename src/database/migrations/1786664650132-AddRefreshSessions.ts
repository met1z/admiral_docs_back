import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRefreshSessions1786664650132 implements MigrationInterface {
    name = 'AddRefreshSessions1786664650132'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "refresh_sessions" ("id" SERIAL NOT NULL, "session_id" character varying(36) NOT NULL, "user_id" integer NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "replaced_by_session_id" character varying(36), "last_used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9190032f6967b7971dca07d69f3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_211c932c84bc7f7ec077a74cf9" ON "refresh_sessions" ("session_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_211c932c84bc7f7ec077a74cf9"`);
        await queryRunner.query(`DROP TABLE "refresh_sessions"`);
    }

}
