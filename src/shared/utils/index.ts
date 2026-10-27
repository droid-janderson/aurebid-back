import { randomBytes, createHash } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";

export function generateRandomString(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

export function generateNumericCode(length: number = 6): string {
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

export function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function formatDecimal(
  value: Decimal | number | string,
  decimals: number = 2,
): number {
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number(num.toFixed(decimals));
}

export function formatCurrency(value: Decimal | number | string): string {
  const num = formatDecimal(value);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
}

export function parsePaginationParams(
  page?: string | number | string[] | Record<string, any>,
  limit?: string | number | string[] | Record<string, any>,
  maxLimit: number = 100,
): { page: number; limit: number; skip: number } {
  const pageStr = Array.isArray(page) ? page[0] : page;
  const limitStr = Array.isArray(limit) ? limit[0] : limit;
  const pageNum = Math.max(1, Number(pageStr) || 1);
  const limitNum = Math.min(maxLimit, Math.max(1, Number(limitStr) || 20));
  return {
    page: pageNum,
    limit: limitNum,
    skip: (pageNum - 1) * limitNum,
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
} {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export function calculateBidIncrement(currentPrice: number): number {
  if (currentPrice < 100) return 5;
  if (currentPrice < 500) return 10;
  if (currentPrice < 1000) return 25;
  if (currentPrice < 5000) return 50;
  if (currentPrice < 10000) return 100;
  if (currentPrice < 50000) return 500;
  if (currentPrice < 100000) return 1000;
  if (currentPrice < 500000) return 5000;
  return 10000;
}

export function getMinimumNextBid(
  startingPrice: number,
  minimumIncrement: number,
  highestBid?: number | null,
): number {
  if (highestBid === undefined || highestBid === null) {
    return startingPrice;
  }

  return highestBid + minimumIncrement;
}

export function validateBidAmount(
  bidAmount: number,
  options: {
    startingPrice: number;
    minimumIncrement: number;
    highestBid?: number | null;
  },
): { valid: boolean; error?: string; minimumNextBid: number } {
  const minimumNextBid = getMinimumNextBid(
    options.startingPrice,
    options.minimumIncrement,
    options.highestBid,
  );

  if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
    return {
      valid: false,
      error: "Bid amount must be positive",
      minimumNextBid,
    };
  }

  if (bidAmount < minimumNextBid) {
    return {
      valid: false,
      error: `Bid must be at least ${formatCurrency(minimumNextBid)}`,
      minimumNextBid,
    };
  }

  return { valid: true, minimumNextBid };
}

export function getBatchTiming(
  startsAt: Date,
  endsAt: Date,
): {
  status: "scheduled" | "active" | "ended";
  timeRemaining: number;
  timeUntilStart: number;
} {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  if (now < start) {
    return {
      status: "scheduled",
      timeRemaining: end - start,
      timeUntilStart: start - now,
    };
  }

  if (now > end) {
    return {
      status: "ended",
      timeRemaining: 0,
      timeUntilStart: 0,
    };
  }

  return {
    status: "active",
    timeRemaining: end - now,
    timeUntilStart: 0,
  };
}

export function formatDate(
  date: Date | string,
  locale: string = "pt-BR",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "agora mesmo";
  if (diffMins < 60) return `${diffMins} min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 30) return `${diffDays}d atrás`;
  return formatDate(d);
}

export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim();
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result;
}

export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in obj) result[key] = obj[key];
  });
  return result;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxAttempts) break;
      await sleep(baseDelay * Math.pow(2, attempt - 1));
    }
  }

  throw lastError!;
}
