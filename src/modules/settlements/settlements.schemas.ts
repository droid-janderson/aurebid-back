import { z } from "zod";

export const settlementQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
    batchId: z.string().min(1, "Invalid batch ID").optional(),
  }),
});

export const settlementIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Invalid settlement ID"),
  }),
});

export const batchIdSchema = z.object({
  params: z.object({
    batchId: z.string().min(1, "Invalid batch ID"),
  }),
});

export type SettlementQueryInput = z.infer<
  typeof settlementQuerySchema
>["query"];
