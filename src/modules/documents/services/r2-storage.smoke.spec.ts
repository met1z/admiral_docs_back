import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { config as loadEnv } from 'dotenv';

import { R2StorageService } from './r2-storage.service';

loadEnv();

const runSmoke = process.env.R2_SMOKE_TEST_ENABLED === '1';
const smokeDescribe = runSmoke ? describe : describe.skip;

type RequiredR2Env = {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_PUBLIC_BASE_URL?: string;
};

function readRequiredEnv(): RequiredR2Env {
  const requiredKeys = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
  ] as const;

  const missing = requiredKeys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing R2 env for smoke test: ${missing.join(', ')}. Set them and rerun with R2_SMOKE_TEST_ENABLED=1.`,
    );
  }

  return {
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID as string,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID as string,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY as string,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME as string,
    R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
  };
}

function createS3Client(env: RequiredR2Env): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: false,
  });
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new Error('R2 object body is empty');
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  const maybeStream = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    [Symbol.asyncIterator]?: () => AsyncIterableIterator<Buffer | Uint8Array | string>;
  };

  if (typeof maybeStream.transformToByteArray === 'function') {
    return Buffer.from(await maybeStream.transformToByteArray());
  }

  if (typeof maybeStream[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(chunk);
      }
    }

    return Buffer.concat(chunks);
  }

  throw new Error('Unsupported R2 body type');
}

async function waitForObject(
  client: S3Client,
  bucketName: string,
  key: string,
  maxAttempts = 10,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
      );
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('R2 object did not become available in time');
}

async function waitForDeletion(
  client: S3Client,
  bucketName: string,
  key: string,
  maxAttempts = 10,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: key,
        }),
      );
    } catch (error) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error('R2 object still exists after delete');
}

smokeDescribe('R2StorageService smoke', () => {
  it(
    'uploads, reads back, and deletes a real object in Cloudflare R2',
    async () => {
      const env = readRequiredEnv();
      const configService = {
        get: jest.fn((key: keyof RequiredR2Env) => env[key]),
      } as unknown as ConfigService;
      const storageService = new R2StorageService(configService);
      const s3Client = createS3Client(env);

      const payload = Buffer.from(
        `r2-smoke-${new Date().toISOString()}-${randomUUID()}`,
        'utf8',
      );
      const key = `documents/smoke/${Date.now()}-${randomUUID()}.txt`;
      const fileName = 'r2-smoke.txt';

      try {
        const uploaded = await storageService.uploadBuffer({
          key,
          buffer: payload,
          mimeType: 'text/plain',
          fileName,
        });

        expect(uploaded.key).toBe(key);
        expect(uploaded.publicUrl).toContain(key);

        await waitForObject(s3Client, env.R2_BUCKET_NAME, key);

        const head = await s3Client.send(
          new HeadObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: key,
          }),
        );

        expect(head.ContentType).toBe('text/plain');
        expect(Number(head.ContentLength)).toBe(payload.length);

        const object = await s3Client.send(
          new GetObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: key,
          }),
        );

        const body = await bodyToBuffer(object.Body);
        expect(body.equals(payload)).toBe(true);
      } finally {
        await storageService.deleteObject(key).catch(() => undefined);
        await waitForDeletion(s3Client, env.R2_BUCKET_NAME, key);
      }
    },
    45_000,
  );
});
