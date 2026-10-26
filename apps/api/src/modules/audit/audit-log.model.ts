import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

export const AUDIT_ACTOR_TYPES = ['staff', 'owner', 'system'] as const;
export const AUDIT_ENTITY_TYPES = [
  'lot',
  'staffUser',
  'mailItem',
  'publicSession',
  'notification',
] as const;
export const AUDIT_ACTIONS = [
  'lot.created',
  'lot.updated',
  'lot.pin_reset',
  'staff.created',
  'staff.updated',
  'mail.created',
  'mail.delivered',
  'notification.retried',
] as const;

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditLogAttrs {
  actorType: AuditActorType;
  actorId: Types.ObjectId | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: Types.ObjectId | null;
  lotId: Types.ObjectId | null;
  requestId: string | null;
  createdAt: Date;
}

const auditLogSchema = new Schema<AuditLogAttrs>(
  {
    actorType: { type: String, required: true, enum: AUDIT_ACTOR_TYPES },
    actorId: { type: Schema.Types.ObjectId, default: null },
    action: { type: String, required: true, enum: AUDIT_ACTIONS },
    entityType: { type: String, required: true, enum: AUDIT_ENTITY_TYPES },
    entityId: { type: Schema.Types.ObjectId, default: null },
    lotId: { type: Schema.Types.ObjectId, ref: 'Lot', default: null },
    requestId: { type: String, default: null, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ lotId: 1, createdAt: -1 });

export type AuditLogDocument = HydratedDocument<AuditLogAttrs>;

export const AuditLogModel = model<AuditLogAttrs>('AuditLog', auditLogSchema);
