import type { Request, Response } from 'express';
import { z } from 'zod';
import { getRequestId, requireStaff } from '../../shared/auth-context.js';
import { readRouteParam } from '../../shared/route-params.js';
import { parseOrThrow } from '../../shared/validation.js';
import type { LotsService } from './lots.service.js';
import {
  createLotSchema,
  lotListQuerySchema,
  pinSchema,
  updateLotSchema,
} from './lots.validator.js';

const resetPinSchema = z.object({ pin: pinSchema });

export function createLotsController(service: LotsService) {
  return {
    async create(request: Request, response: Response): Promise<void> {
      const input = parseOrThrow(createLotSchema, request.body);
      const lot = await service.create(requireStaff(request), input, getRequestId(request));

      response.status(201).json({ data: lot });
    },

    async list(request: Request, response: Response): Promise<void> {
      const query = parseOrThrow(lotListQuerySchema, request.query);
      const result = await service.list(requireStaff(request), query);

      response.status(200).json({
        data: result.items,
        meta: { page: result.page, limit: result.limit, total: result.total },
      });
    },

    async getById(request: Request, response: Response): Promise<void> {
      const lot = await service.getById(requireStaff(request), readRouteParam(request, 'id'));

      response.status(200).json({ data: lot });
    },

    async update(request: Request, response: Response): Promise<void> {
      const changes = parseOrThrow(updateLotSchema, request.body);
      const lot = await service.update(
        requireStaff(request),
        readRouteParam(request, 'id'),
        changes,
        getRequestId(request),
      );

      response.status(200).json({ data: lot });
    },

    async resetPin(request: Request, response: Response): Promise<void> {
      const input = parseOrThrow(resetPinSchema, request.body);

      await service.resetPin(
        requireStaff(request),
        readRouteParam(request, 'id'),
        input.pin,
        getRequestId(request),
      );

      response.status(204).end();
    },
  };
}
