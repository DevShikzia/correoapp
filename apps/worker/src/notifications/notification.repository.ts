import { isValidObjectId } from 'mongoose';
import {
  NotificationJobModel,
  type NotificationJobDocument,
  type NotificationStatus,
} from './notification-job.model.js';

export interface WorkerNotificationJobRecord {
  id: string;
  lotNumber: string;
  phone: string;
  status: NotificationStatus;
  attempts: number;
  providerMessageId: string | null;
}

export interface NotificationJobRepository {
  findById(id: string): Promise<WorkerNotificationJobRecord | null>;
  markSending(id: string, attempt: number): Promise<void>;
  markSent(id: string, providerMessageId: string, sentAt: Date): Promise<void>;
  markRetry(id: string, errorCode: string): Promise<void>;
  markFailed(id: string, errorCode: string): Promise<void>;
}

export interface RequeuableNotification {
  id: string;
  retryCount: number;
}

export interface RequeueRepository {
  findStalePending(olderThan: Date, limit: number): Promise<RequeuableNotification[]>;
  claimForRequeue(id: string, olderThan: Date): Promise<RequeuableNotification | null>;
  releaseToPending(id: string): Promise<void>;
}

function toRecord(doc: NotificationJobDocument): WorkerNotificationJobRecord {
  return {
    id: doc._id.toString(),
    lotNumber: doc.lotNumber,
    phone: doc.phone,
    status: doc.status,
    attempts: doc.attempts,
    providerMessageId: doc.providerMessageId,
  };
}

export const notificationJobRepository: NotificationJobRepository = {
  async findById(id: string): Promise<WorkerNotificationJobRecord | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const doc = await NotificationJobModel.findById(id);
    return doc === null ? null : toRecord(doc);
  },

  async markSending(id: string, attempt: number): Promise<void> {
    if (!isValidObjectId(id)) {
      return;
    }

    await NotificationJobModel.updateOne(
      { _id: id },
      { $set: { status: 'sending', attempts: attempt } },
    );
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
};

function toRequeuable(doc: NotificationJobDocument): RequeuableNotification {
  return { id: doc._id.toString(), retryCount: doc.retryCount ?? 0 };
}

/**
 * Reencolado de avisos que quedaron `pending` porque Redis no respondió al
 * registrarlos. Solo toca avisos antiguos y nunca `queued`/`sending`, donde el
 * mensaje pudo haber salido sin confirmación.
 */
export const notificationRequeueRepository: RequeueRepository = {
  async findStalePending(olderThan: Date, limit: number): Promise<RequeuableNotification[]> {
    const documents = await NotificationJobModel.find({
      status: 'pending',
      createdAt: { $lt: olderThan },
    })
      .sort({ createdAt: 1 })
      .limit(limit);

    return documents.map(toRequeuable);
  },

  async claimForRequeue(id: string, olderThan: Date): Promise<RequeuableNotification | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const doc = await NotificationJobModel.findOneAndUpdate(
      { _id: id, status: 'pending', createdAt: { $lt: olderThan } },
      { $set: { status: 'queued' } },
      { returnDocument: 'after' },
    );

    return doc === null ? null : toRequeuable(doc);
  },

  async releaseToPending(id: string): Promise<void> {
    if (!isValidObjectId(id)) {
      return;
    }

    await NotificationJobModel.updateOne(
      { _id: id, status: 'queued' },
      { $set: { status: 'pending' } },
    );
  },
};
