import { z } from "zod";

export const bidQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    batchId: z.string().min(1, "Invalid batch ID").optional(),
    bidderId: z.string().min(1, "Invalid bidder ID").optional(),
  }),
});

export type BidQueryInput = z.infer<typeof bidQuerySchema>["query"];
