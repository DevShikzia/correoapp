import type { Request, Response } from 'express';
import { getRequestId, requireStaff } from '../../shared/auth-context.js';
import { readRouteParam } from '../../shared/route-params.js';
import { parseOrThrow } from '../../shared/validation.js';
import type { NotificationAdminService } from './notification-admin.service.js';
import { notificationListQuerySchema } from './notification.validator.js';

export function createNotificationsController(service: NotificationAdminService) {
  return {
    async list(request: Request, response: Response): Promise<void> {
      const query = parseOrThrow(notificationListQuerySchema, request.query);
      const result = await service.list(requireStaff(request), query);

      response.status(200).json({
        data: result.items,
        meta: { page: result.page, limit: result.limit, total: result.total },
      });
    },

    async retry(request: Request, response: Response): Promise<void> {
      const item = await service.retry(
        requireStaff(request),
        readRouteParam(request, 'id'),
        getRequestId(request),
      );

      response.status(200).json({ data: item });
    },
  };
}
