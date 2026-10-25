import type { Schema } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { AuditLogModel } from '../src/modules/audit/audit-log.model.js';
import { LotModel } from '../src/modules/lots/lot.model.js';
import { MailItemModel } from '../src/modules/mail/mail-item.model.js';
import { NotificationJobModel } from '../src/modules/notifications/notification-job.model.js';
import { PublicSessionModel } from '../src/modules/public/public-session.model.js';
import { StaffUserModel } from '../src/modules/staff/staff-user.model.js';

function indexKeys(indexes: ReturnType<Schema['indexes']>): string[] {
  return indexes.map(([fields]) => Object.keys(fields).join(',')).sort();
}

describe('índices de los modelos', () => {
  it('Lot tiene índice único por número de lote', () => {
    const uniqueIndex = LotModel.schema.indexes().find(([fields]) => 'lotNumber' in fields);

    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex?.[1]).toMatchObject({ unique: true });
  });

  it('StaffUser tiene índice único por usuario', () => {
    const uniqueIndex = StaffUserModel.schema.indexes().find(([fields]) => 'username' in fields);

    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex?.[1]).toMatchObject({ unique: true });
  });

  it('MailItem indexa por lote y estado con fecha de recepción', () => {
    expect(indexKeys(MailItemModel.schema.indexes())).toEqual(
      expect.arrayContaining(['lotId,receivedAt', 'status,receivedAt']),
    );
  });

  it('AuditLog indexa por fecha y por lote', () => {
    expect(indexKeys(AuditLogModel.schema.indexes())).toEqual(
      expect.arrayContaining(['createdAt', 'lotId,createdAt']),
    );
  });

  it('PublicSession tiene token único y TTL por vencimiento', () => {
    const tokenIndex = PublicSessionModel.schema
      .indexes()
      .find(([fields]) => 'tokenHash' in fields);

    expect(tokenIndex?.[1]).toMatchObject({ unique: true });

    const ttlIndex = PublicSessionModel.schema.indexes().find(([fields]) => 'expiresAt' in fields);

    expect(ttlIndex?.[1]).toMatchObject({ expireAfterSeconds: 0 });
  });

  it('NotificationJob es único por correspondencia y teléfono', () => {
    const uniqueIndex = NotificationJobModel.schema
      .indexes()
      .find(([fields]) => 'mailItemId' in fields && 'phone' in fields);

    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex?.[1]).toMatchObject({ unique: true });
    expect(indexKeys(NotificationJobModel.schema.indexes())).toEqual(
      expect.arrayContaining(['status,createdAt']),
    );
  });
});

describe('campos sensibles', () => {
  it('los hashes no se devuelven por defecto', () => {
    expect(LotModel.schema.path('pinHash').options['select']).toBe(false);
    expect(StaffUserModel.schema.path('passwordHash').options['select']).toBe(false);
  });
});

describe('valores permitidos', () => {
  it('MailItem solo acepta estados conocidos', () => {
    expect(MailItemModel.schema.path('status').options['enum']).toEqual(['pending', 'delivered']);
  });

  it('StaffUser solo acepta roles conocidos', () => {
    expect(StaffUserModel.schema.path('role').options['enum']).toEqual(['admin', 'guard']);
  });

  it('AuditLog registra las acciones de correspondencia', () => {
    expect(AuditLogModel.schema.path('action').options['enum']).toEqual(
      expect.arrayContaining(['mail.created', 'mail.delivered']),
    );
  });

  it('MailItem guarda el número de lote resuelto por el servidor', () => {
    expect(MailItemModel.schema.path('lotNumber').options['required']).toBe(true);
  });
});
