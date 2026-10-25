export interface AttemptLimiterOptions {
  maxAttempts: number;
  windowMs: number;
  now?: () => Date;
}

export interface AttemptLimiter {
  isBlocked(key: string): boolean;
  registerFailure(key: string): void;
  reset(key: string): void;
}

interface AttemptRecord {
  count: number;
  windowStartedAt: number;
}

const MAX_TRACKED_KEYS = 1_000;

export function createAttemptLimiter({
  maxAttempts,
  windowMs,
  now = () => new Date(),
}: AttemptLimiterOptions): AttemptLimiter {
  const attempts = new Map<string, AttemptRecord>();

  function isExpired(record: AttemptRecord, currentTime: number): boolean {
    return currentTime - record.windowStartedAt >= windowMs;
  }

  function pruneExpired(currentTime: number): void {
    for (const [key, record] of attempts) {
      if (isExpired(record, currentTime)) {
        attempts.delete(key);
      }
    }
  }

  return {
    isBlocked(key: string): boolean {
      const currentTime = now().getTime();
      const record = attempts.get(key);

      if (record === undefined || isExpired(record, currentTime)) {
        attempts.delete(key);
        return false;
      }

      return record.count >= maxAttempts;
    },

    registerFailure(key: string): void {
      const currentTime = now().getTime();

      if (attempts.size >= MAX_TRACKED_KEYS) {
        pruneExpired(currentTime);
        // Si todas las ventanas siguen activas, se descarta la entrada más antigua
        // para que un ataque con muchas claves no haga crecer la memoria sin límite.
        while (attempts.size >= MAX_TRACKED_KEYS) {
          const oldestKey = attempts.keys().next().value;

          if (oldestKey === undefined) {
            break;
          }

          attempts.delete(oldestKey);
        }
      }

      const record = attempts.get(key);

      if (record === undefined || isExpired(record, currentTime)) {
        attempts.set(key, { count: 1, windowStartedAt: currentTime });
        return;
      }

      record.count += 1;
    },

    reset(key: string): void {
      attempts.delete(key);
    },
  };
}
