import { pino } from 'pino';
import { env } from './env.js';

const SENSITIVE_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'pin',
  '*.password',
  '*.pin',
  '*.token',
];

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  base: { service: 'api' },
  redact: { paths: SENSITIVE_LOG_PATHS, censor: '[redactado]' },
});
