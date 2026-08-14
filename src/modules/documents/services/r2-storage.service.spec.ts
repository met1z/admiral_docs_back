import { ConfigService } from '@nestjs/config';

import { R2StorageService } from './r2-storage.service';

describe('R2StorageService', () => {
  it('builds public urls from custom base url', () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          R2_ACCOUNT_ID: 'account',
          R2_ACCESS_KEY_ID: 'access',
          R2_SECRET_ACCESS_KEY: 'secret',
          R2_BUCKET_NAME: 'bucket',
          R2_PUBLIC_BASE_URL: 'https://cdn.example',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const service = new R2StorageService(configService);

    expect(service.buildPublicUrl('documents/1/file.txt')).toBe(
      'https://cdn.example/documents/1/file.txt',
    );
  });

  it('falls back to the default R2 public bucket url when custom base is absent', () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string | undefined> = {
          R2_ACCOUNT_ID: 'account',
          R2_ACCESS_KEY_ID: 'access',
          R2_SECRET_ACCESS_KEY: 'secret',
          R2_BUCKET_NAME: 'bucket',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const service = new R2StorageService(configService);

    expect(service.buildPublicUrl('documents/1/file.txt')).toBe(
      'https://bucket.account.r2.cloudflarestorage.com/documents/1/file.txt',
    );
  });
});

