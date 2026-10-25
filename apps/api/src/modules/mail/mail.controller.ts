import type { Request, Response } from 'express';
import { getRequestId, requireStaff } from '../../shared/auth-context.js';
import { paginationSchema } from '../../shared/pagination.js';
import { readRouteParam } from '../../shared/route-params.js';
import { parseOrThrow } from '../../shared/validation.js';
import type { MailService } from './mail.service.js';
import { createMailSchema } from './mail.validator.js';

export function createMailController(service: MailService) {
  return {
    async register(request: Request, response: Response): Promise<void> {
      const input = parseOrThrow(createMailSchema, request.body);
      const item = await service.register(requireStaff(request), input, getRequestId(request));

      response.status(201).json({ data: item });
    },

    async listPending(request: Request, response: Response): Promise<void> {
      const query = parseOrThrow(paginationSchema, request.query);
      const result = await service.listPending(requireStaff(request), query);

      response.status(200).json({
        data: result.items,
        meta: { page: result.page, limit: result.limit, total: result.total },
      });
    },

    async getById(request: Request, response: Response): Promise<void> {
      const item = await service.getById(requireStaff(request), readRouteParam(request, 'id'));

      response.status(200).json({ data: item });
    },

    async deliver(request: Request, response: Response): Promise<void> {
      const item = await service.deliver(
        requireStaff(request),
        readRouteParam(request, 'id'),
        getRequestId(request),
      );

      response.status(200).json({ data: item });
    },
  };
}
