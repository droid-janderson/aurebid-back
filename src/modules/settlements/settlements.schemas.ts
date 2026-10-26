import { z } from 'zod';

export const settlementQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
    lotId: z.string().min(1, 'Invalid lot ID').optional(),
  }),
});

export const settlementIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Invalid settlement ID'),
  }),
});

export const lotIdSchema = z.object({
  params: z.object({
    lotId: z.string().min(1, 'Invalid lot ID'),
  }),
});

export type SettlementQueryInput = z.infer<typeof settlementQuerySchema>['query'];
