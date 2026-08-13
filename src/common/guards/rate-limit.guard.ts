import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();

    const ip =
      request.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim() ??
      request.ip ??
      'unknown';
    const key = `${context.getClass().name}:${context.getHandler().name}:${ip}`;
    const now = Date.now();

    this.pruneExpiredBuckets(now);

    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + options.ttlMs,
      });
      return true;
    }

    if (bucket.count >= options.limit) {
      throw new HttpException('Забагато запитів. Спробуйте пізніше.', HttpStatus.TOO_MANY_REQUESTS);
    }

    bucket.count += 1;
    return true;
  }

  private pruneExpiredBuckets(now: number): void {
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
