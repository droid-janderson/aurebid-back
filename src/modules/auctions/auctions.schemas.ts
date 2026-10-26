import { z } from 'zod';

export const auctionQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED', 'SETTLED', 'CANCELLED']).optional(),
    sellerId: z.string().min(1, 'Invalid seller ID').optional(),
    search: z.string().optional(),
    sortBy: z.enum(['startsAt', 'endsAt', 'startingPrice', 'createdAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const placeBidSchema = z.object({
  body: z.object({
    amount: z.number().positive('Bid amount must be positive'),
  }),
  params: z.object({
    id: z.string().min(1, 'Invalid lot ID'),
  }),
});

export const bidQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    bidderId: z.string().min(1, 'Invalid bidder ID').optional(),
  }),
});

export const updateLotStatusSchema = z.object({
  body: z.object({
    status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED', 'SETTLED', 'CANCELLED']),
  }),
  params: z.object({
    id: z.string().min(1, 'Invalid lot ID'),
  }),
});

export type PlaceBidInput = z.infer<typeof placeBidSchema>['body'];
