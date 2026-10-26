export interface AttemptLimiterOptions {
  maxAttempts: number;
  windowMs: number;
  now?: () => Date;
}

export interface AttemptLimiter {
  isBlocked(key: string): Promise<boolean>;
  registerFailure(key: string): Promise<void>;
  reset(key: string): Promise<void>;
}

interface AttemptRecord {
  count: number;
  windowStartedAt: number;
}

const MAX_TRACKED_KEYS = 1_000;

/**
 * Limitador local para desarrollo, tests y fallback cuando Redis no responde.
 * No se comparte entre instancias: cada proceso lleva su propia cuenta.
 */
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
    async isBlocked(key: string): Promise<boolean> {
      const currentTime = now().getTime();
      const record = attempts.get(key);

      if (record === undefined || isExpired(record, currentTime)) {
        attempts.delete(key);
        return false;
      }

      return record.count >= maxAttempts;
    },

    async registerFailure(key: string): Promise<void> {
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

    async reset(key: string): Promise<void> {
      attempts.delete(key);
    },
  };
}
