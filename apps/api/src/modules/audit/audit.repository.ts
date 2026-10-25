import { isValidObjectId, Types } from 'mongoose';
import {
  AuditLogModel,
  type AuditAction,
  type AuditActorType,
  type AuditEntityType,
} from './audit-log.model.js';

export interface AuditEntryInput {
  actorType: AuditActorType;
  actorId?: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  lotId?: string;
  requestId?: string;
}

export interface AuditRepository {
  record(entry: AuditEntryInput): Promise<void>;
}

function toObjectId(value: string | undefined): Types.ObjectId | null {
  if (value === undefined || !isValidObjectId(value)) {
    return null;
  }
  return new Types.ObjectId(value);
}

export const auditRepository: AuditRepository = {
  async record(entry: AuditEntryInput): Promise<void> {
    await AuditLogModel.create({
      actorType: entry.actorType,
      actorId: toObjectId(entry.actorId),
      action: entry.action,
      entityType: entry.entityType,
      entityId: toObjectId(entry.entityId),
      lotId: toObjectId(entry.lotId),
      requestId: entry.requestId ?? null,
    });
  },
};
