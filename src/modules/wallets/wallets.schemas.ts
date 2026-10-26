import { z } from 'zod';

export const depositSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be positive'),
    method: z.enum(['PIX', 'BANK_TRANSFER', 'CREDIT_CARD', 'BOLETO']),
    metadata: z.record(z.string(), z.any()).optional(),
  }),
});

export const withdrawSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be positive'),
    method: z.enum(['PIX', 'BANK_TRANSFER']),
    destination: z.object({
      bankCode: z.string().optional(),
      agency: z.string().optional(),
      account: z.string().optional(),
      accountType: z.enum(['CHECKING', 'SAVINGS']).optional(),
      pixKey: z.string().optional(),
      pixKeyType: z.enum(['CPF', 'EMAIL', 'PHONE', 'RANDOM']).optional(),
    }),
  }),
});

export const transactionQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    type: z
      .enum([
        'DEPOSIT',
        'BUYER_SETTLEMENT_DEBIT',
        'SELLER_SETTLEMENT_CREDIT',
        'REFUND',
        'ADJUSTMENT',
      ])
      .optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});

export type DepositInput = z.infer<typeof depositSchema>['body'];
export type WithdrawInput = z.infer<typeof withdrawSchema>['body'];
