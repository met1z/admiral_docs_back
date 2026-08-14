import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2StorageService {
  private static readonly signedUrlExpiresInSeconds = 16 * 60 * 60;
  private static readonly signedUrlCacheTtlMs = 15 * 60 * 60 * 1000;

  private readonly client: S3Client;
  private readonly accountId: string;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string | null;
  private readonly signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

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

  async createSignedGetUrl(input: {
    key: string;
    fileName: string;
    mimeType: string;
    disposition: 'inline' | 'attachment';
    expiresInSeconds?: number;
  }): Promise<string> {
    const cacheKey = [
      input.key,
      input.fileName,
      input.mimeType,
      input.disposition,
      input.expiresInSeconds ?? R2StorageService.signedUrlExpiresInSeconds,
    ].join(':');
    const cached = this.signedUrlCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.url;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: input.key,
      ResponseContentType: input.mimeType,
      ResponseContentDisposition: `${input.disposition}; filename="${this.escapeHeaderValue(input.fileName)}"`,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds ?? R2StorageService.signedUrlExpiresInSeconds,
    }).then((url) => {
      this.signedUrlCache.set(cacheKey, {
        url,
        expiresAt: now + R2StorageService.signedUrlCacheTtlMs,
      });

      return url;
    });
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
