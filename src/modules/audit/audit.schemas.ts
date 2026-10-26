import { z } from 'zod';

export const auditQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    lotId: z.string().min(1, 'Invalid lot ID').optional(),
    bidderId: z.string().min(1, 'Invalid bidder ID').optional(),
  }),
});

export const lotAuditSchema = z.object({
  params: z.object({
    lotId: z.string().min(1, 'Invalid lot ID'),
  }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

export const bidAuditSchema = z.object({
  params: z.object({
    bidId: z.string().min(1, 'Invalid bid ID'),
  }),
});

export type AuditQueryInput = z.infer<typeof auditQuerySchema>['query'];
