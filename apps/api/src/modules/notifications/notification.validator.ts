import { z } from 'zod';
import { paginationSchema } from '../../shared/pagination.js';
import { NOTIFICATION_STATUSES } from './notification-job.model.js';

export const notificationListQuerySchema = paginationSchema.extend({
  status: z.enum(NOTIFICATION_STATUSES).optional(),
});

export type NotificationListInput = z.infer<typeof notificationListQuerySchema>;
