import { z } from 'zod';

const productDataSchema = z.record(z.string(), z.any()).optional();

export const createLotSchema = z.object({
  body: z.object({
    sellerId: z.string().min(1, 'Invalid seller ID').optional(),
    productSource: z.string().min(1, 'Product source is required').max(100),
    externalProductId: z.string().min(1, 'External product ID is required').max(200),
    title: z.string().min(3, 'Title must be at least 3 characters').max(200),
    description: z.string().max(5000).optional(),
    imageUrl: z.string().url('Invalid image URL').optional(),
    productData: productDataSchema,
    startingPrice: z.number().positive('Starting price must be positive'),
    minimumIncrement: z.number().positive('Minimum increment must be positive'),
    startsAt: z.string().datetime({ message: 'Invalid start date' }),
    endsAt: z.string().datetime({ message: 'Invalid end date' }),
    status: z.enum(['DRAFT', 'SCHEDULED']).optional(),
  }),
});

export const updateLotSchema = z.object({
  body: z.object({
    productSource: z.string().min(1).max(100).optional(),
    externalProductId: z.string().min(1).max(200).optional(),
    title: z.string().min(3).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    productData: productDataSchema,
    startingPrice: z.number().positive().optional(),
    minimumIncrement: z.number().positive().optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    status: z.enum(['DRAFT', 'SCHEDULED']).optional(),
  }),
  params: z.object({
    id: z.string().min(1, 'Invalid lot ID'),
  }),
});

export const lotQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED', 'SETTLED', 'CANCELLED']).optional(),
    sellerId: z.string().min(1, 'Invalid seller ID').optional(),
    productSource: z.string().optional(),
    search: z.string().optional(),
    minPrice: z.string().optional(),
    maxPrice: z.string().optional(),
    sortBy: z.enum(['createdAt', 'startsAt', 'endsAt', 'title', 'startingPrice']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export type CreateLotInput = z.infer<typeof createLotSchema>['body'];
export type UpdateLotInput = z.infer<typeof updateLotSchema>['body'];
export type LotQueryInput = z.infer<typeof lotQuerySchema>['query'];
