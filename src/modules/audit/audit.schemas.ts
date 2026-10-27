import { z } from "zod";

export const auditQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    batchId: z.string().min(1, "Invalid batch ID").optional(),
    bidderId: z.string().min(1, "Invalid bidder ID").optional(),
  }),
});

export const batchAuditSchema = z.object({
  params: z.object({
    batchId: z.string().min(1, "Invalid batch ID"),
  }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

export const bidAuditSchema = z.object({
  params: z.object({
    bidId: z.string().min(1, "Invalid bid ID"),
  }),
});

export type AuditQueryInput = z.infer<typeof auditQuerySchema>["query"];
