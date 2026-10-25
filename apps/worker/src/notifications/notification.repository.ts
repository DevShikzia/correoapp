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
