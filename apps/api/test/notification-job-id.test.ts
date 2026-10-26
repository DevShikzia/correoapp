import { describe, expect, it } from 'vitest';
import { notificationJobId } from '../src/modules/notifications/notification.constants.js';

describe('notificationJobId', () => {
  it('usa el id del aviso para el primer envío', () => {
    expect(notificationJobId('notification-1', 0)).toBe('notification-1');
  });

  it('genera un id distinto por reintento sin dos puntos', () => {
    const first = notificationJobId('notification-1', 1);
    const second = notificationJobId('notification-1', 2);

    expect(first).toBe('notification-1-r1');
    expect(second).toBe('notification-1-r2');
    expect(first).not.toBe(second);
    // BullMQ rechaza `:` en los jobId personalizados.
    expect(first).not.toContain(':');
  });
});
