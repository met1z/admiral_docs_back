import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDocumentStorageKey1786672590791 implements MigrationInterface {
    name = 'AddDocumentStorageKey1786672590791'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "document_file" ADD "storage_key" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "document_file" DROP COLUMN "storage_key"`);
    }

}
