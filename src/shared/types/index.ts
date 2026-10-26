import { Request } from "express";
import { UserRole, LotStatus } from "@prisma/client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface JWTPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  type: "access" | "refresh";
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: ValidationError[];
  details?: Record<string, unknown>;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface RequestWithUser extends Request {
  user?: AuthUser;
}

export interface SocketUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface LotTiming {
  status: "scheduled" | "active" | "ended";
  timeRemaining: number;
  timeUntilStart: number;
}

export interface LotProductData {
  [key: string]: unknown;
}

export interface LotSummary {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startingPrice: number;
  minimumIncrement: number;
  startsAt: Date;
  endsAt: Date;
  status: LotStatus;
  currentPrice: number;
  bidCount: number;
  uniqueBidders: number;
}

export interface BidWithBidder {
  id: string;
  lotId: string;
  amount: number;
  createdAt: Date;
  bidder: {
    id: string;
    name: string;
  };
}

export interface WalletBalance {
  balance: number;
  reservedAmount: number;
  availableAmount: number;
}
