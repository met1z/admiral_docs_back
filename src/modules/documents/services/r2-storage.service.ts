import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

@Injectable()
export class R2StorageService {
  private readonly client: S3Client;
  private readonly accountId: string;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string | null;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME');

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error('R2 configuration is missing');
    }

    this.accountId = accountId;
    this.bucketName = bucketName;
    this.publicBaseUrl = this.configService.get<string>('R2_PUBLIC_BASE_URL') ?? null;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: false,
    });
  }

  async uploadBuffer(input: {
    key: string;
    buffer: Buffer;
    mimeType: string;
    fileName: string;
  }): Promise<{ key: string; publicUrl: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: input.key,
        Body: input.buffer,
        ContentType: input.mimeType,
        ContentDisposition: `inline; filename="${this.escapeHeaderValue(input.fileName)}"`,
      }),
    );

    return {
      key: input.key,
      publicUrl: this.buildPublicUrl(input.key),
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }

  buildPublicUrl(key: string): string {
    const normalizedKey = key.replace(/^\/+/, '');
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/+$/, '')}/${normalizedKey}`;
    }

    return `https://${this.bucketName}.${this.accountId}.r2.cloudflarestorage.com/${normalizedKey}`;
  }

  private escapeHeaderValue(value: string): string {
    return value.replace(/"/g, '\\"');
  }
}
