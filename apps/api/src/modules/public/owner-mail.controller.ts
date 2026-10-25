import type { Request, Response } from 'express';
import { requireOwner } from '../../shared/auth-context.js';
import { paginationSchema } from '../../shared/pagination.js';
import { parseOrThrow } from '../../shared/validation.js';
import type { OwnerMailService } from './owner-mail.service.js';

export function createOwnerMailController(service: OwnerMailService) {
  return {
    async list(request: Request, response: Response): Promise<void> {
      const owner = requireOwner(request);
      const query = parseOrThrow(paginationSchema, request.query);
      const result = await service.list(owner.lotId, query);

      response.status(200).json({
        data: result.items,
        meta: { page: result.page, limit: result.limit, total: result.total },
      });
    },
  };
}
