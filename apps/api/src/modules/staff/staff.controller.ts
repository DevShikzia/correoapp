import type { Request, Response } from 'express';
import { getRequestId, requireStaff } from '../../shared/auth-context.js';
import { readRouteParam } from '../../shared/route-params.js';
import { parseOrThrow } from '../../shared/validation.js';
import type { StaffService } from './staff.service.js';
import { createStaffSchema, staffListQuerySchema, updateStaffSchema } from './staff.validator.js';

export function createStaffController(service: StaffService) {
  return {
    async create(request: Request, response: Response): Promise<void> {
      const input = parseOrThrow(createStaffSchema, request.body);
      const user = await service.create(requireStaff(request), input, getRequestId(request));

      response.status(201).json({ data: user });
    },

    async list(request: Request, response: Response): Promise<void> {
      const query = parseOrThrow(staffListQuerySchema, request.query);
      const result = await service.list(requireStaff(request), query);

      response.status(200).json({
        data: result.items,
        meta: { page: result.page, limit: result.limit, total: result.total },
      });
    },

    async update(request: Request, response: Response): Promise<void> {
      const changes = parseOrThrow(updateStaffSchema, request.body);
      const user = await service.update(
        requireStaff(request),
        readRouteParam(request, 'id'),
        changes,
        getRequestId(request),
      );

      response.status(200).json({ data: user });
    },
  };
}
