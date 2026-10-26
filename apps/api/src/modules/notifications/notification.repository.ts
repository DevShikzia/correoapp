import { isValidObjectId, Types } from 'mongoose';
import { PHONE_PATTERN } from '../lots/lot.constants.js';
import { isDuplicateKeyError } from '../../shared/mongo-errors.js';
import type { Paginated } from '../../shared/pagination.js';
import {
  NotificationJobModel,
  type NotificationJobDocument,
  type NotificationStatus,
} from './notification-job.model.js';

export interface NotificationListQuery {
  status?: NotificationStatus;
  page: number;
  limit: number;
}

export interface NotificationJobRecord {
  id: string;
  mailItemId: string;
  lotId: string;
  lotNumber: string;
  phone: string;
  status: NotificationStatus;
  attempts: number;
  retryCount: number;
  providerMessageId: string | null;
  providerStatus: string | null;
  lastErrorCode: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationJobInput {
  mailItemId: string;
  lotId: string;
  lotNumber: string;
  phone: string;
}

export interface NotificationRepository {
  createMany(inputs: CreateNotificationJobInput[]): Promise<NotificationJobRecord[]>;
  findById(id: string): Promise<NotificationJobRecord | null>;
  list(query: NotificationListQuery): Promise<Paginated<NotificationJobRecord>>;
  markQueued(id: string): Promise<void>;
  markSending(id: string, attempt: number): Promise<NotificationJobRecord | null>;
  markSent(id: string, providerMessageId: string, sentAt: Date): Promise<void>;
  markRetry(id: string, errorCode: string): Promise<void>;
  markFailed(id: string, errorCode: string): Promise<void>;
  resetForRetry(id: string): Promise<NotificationJobRecord | null>;
  revertToPending(id: string): Promise<void>;
  applyProviderStatus(
    providerMessageId: string,
    status: 'sent' | 'failed',
    providerStatus: string,
    errorCode: string | null,
  ): Promise<number>;
}

function toRecord(doc: NotificationJobDocument): NotificationJobRecord {
  return {
    id: doc._id.toString(),
    mailItemId: doc.mailItemId.toString(),
    lotId: doc.lotId.toString(),
    lotNumber: doc.lotNumber,
    phone: doc.phone,
    status: doc.status,
    attempts: doc.attempts,
    retryCount: doc.retryCount ?? 0,
    providerMessageId: doc.providerMessageId,
    providerStatus: doc.providerStatus,
    lastErrorCode: doc.lastErrorCode,
    sentAt: doc.sentAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const notificationRepository: NotificationRepository = {
  async createMany(inputs: CreateNotificationJobInput[]): Promise<NotificationJobRecord[]> {
    const records: NotificationJobRecord[] = [];

    for (const input of inputs) {
      if (
        !isValidObjectId(input.mailItemId) ||
        !isValidObjectId(input.lotId) ||
        !PHONE_PATTERN.test(input.phone)
      ) {
        throw new Error('Datos inválidos para registrar la notificación');
      }

      const filter = {
        mailItemId: new Types.ObjectId(input.mailItemId),
        phone: input.phone,
      };

      try {
        const doc = await NotificationJobModel.findOneAndUpdate(
          filter,
          {
            $setOnInsert: {
              lotId: new Types.ObjectId(input.lotId),
              lotNumber: input.lotNumber,
              phone: input.phone,
            },
          },
          { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
        );

        if (doc !== null) {
          records.push(toRecord(doc));
        }
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }

        // Otra petición creó el registro en paralelo: se reutiliza el existente.
        const existing = await NotificationJobModel.findOne(filter);

        if (existing !== null) {
          records.push(toRecord(existing));
        }
      }
    }

    return records;
  },

  async findById(id: string): Promise<NotificationJobRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const doc = await NotificationJobModel.findById(id);
    return doc === null ? null : toRecord(doc);
  },

  async list({
    status,
    page,
    limit,
  }: NotificationListQuery): Promise<Paginated<NotificationJobRecord>> {
    const filter = status === undefined ? {} : { status };

    const [documents, total] = await Promise.all([
      NotificationJobModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      NotificationJobModel.countDocuments(filter),
    ]);

    return { items: documents.map(toRecord), page, limit, total };
  },

  async markQueued(id: string): Promise<void> {
    if (!isValidObjectId(id)) {
      return;
    }

    await NotificationJobModel.updateOne(
      { _id: id, status: 'pending' },
      { $set: { status: 'queued' } },
    );
  },

  async markSending(id: string, attempt: number): Promise<NotificationJobRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const doc = await NotificationJobModel.findOneAndUpdate(
      { _id: id },
      { $set: { status: 'sending', attempts: attempt } },
      { returnDocument: 'after', runValidators: true },
    );

    return doc === null ? null : toRecord(doc);
  },

  async markSent(id: string, providerMessageId: string, sentAt: Date): Promise<void> {
    if (!isValidObjectId(id)) {
      return;
    }

    await NotificationJobModel.updateOne(
      { _id: id },
      {
        $set: {
          status: 'sent',
          providerMessageId,
          providerStatus: 'sent',
          lastErrorCode: null,
          sentAt,
        },
      },
    );
  },

  async markRetry(id: string, errorCode: string): Promise<void> {
    if (!isValidObjectId(id)) {
      return;
    }

    await NotificationJobModel.updateOne(
      { _id: id },
      { $set: { status: 'queued', lastErrorCode: errorCode } },
    );
  },

  async markFailed(id: string, errorCode: string): Promise<void> {
    if (!isValidObjectId(id)) {
      return;
    }

    await NotificationJobModel.updateOne(
      { _id: id },
      { $set: { status: 'failed', lastErrorCode: errorCode } },
    );
  },

  async resetForRetry(id: string): Promise<NotificationJobRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    // Solo los avisos reintentables pasan a `queued`; dos reintentos simultáneos
    // compiten por la misma condición y únicamente uno gana.
    const doc = await NotificationJobModel.findOneAndUpdate(
      { _id: id, status: { $in: ['failed', 'pending'] } },
      {
        $set: { status: 'queued', attempts: 0, lastErrorCode: null },
        $inc: { retryCount: 1 },
      },
      { returnDocument: 'after', runValidators: true },
    );

    return doc === null ? null : toRecord(doc);
  },

  async revertToPending(id: string): Promise<void> {
    if (!isValidObjectId(id)) {
      return;
    }

    await NotificationJobModel.updateOne(
      { _id: id, status: 'queued' },
      { $set: { status: 'pending' } },
    );
  },

  async applyProviderStatus(
    providerMessageId: string,
    status: 'sent' | 'failed',
    providerStatus: string,
    errorCode: string | null,
  ): Promise<number> {
    const filter = { providerMessageId };

    const result = await NotificationJobModel.updateOne(filter, {
      $set: {
        status,
        providerStatus,
        lastErrorCode: errorCode,
      },
    });

    if (status === 'sent') {
      // Conserva la fecha del envío original; el webhook solo confirma estados.
      await NotificationJobModel.updateOne(
        { ...filter, sentAt: null },
        { $set: { sentAt: new Date() } },
      );
    }

    return result.modifiedCount;
  },
};
