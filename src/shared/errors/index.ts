// Custom error classes for the application

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.details = details;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly errors: Array<{ field: string; message: string; code: string }>;

  constructor(message: string, errors: Array<{ field: string; message: string; code: string }> = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', details?: Record<string, unknown>) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', details?: Record<string, unknown>) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource', details?: Record<string, unknown>) {
    super(`${resource} not found`, 404, 'NOT_FOUND', details);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, 'CONFLICT', details);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'BAD_REQUEST', details);
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class AuctionError extends AppError {
  constructor(message: string, code: string = 'AUCTION_ERROR', details?: Record<string, unknown>) {
    super(message, 400, code, details);
    Object.setPrototypeOf(this, AuctionError.prototype);
  }
}

export class LotError extends AppError {
  constructor(message: string, code: string = 'LOT_ERROR', details?: Record<string, unknown>) {
    super(message, 400, code, details);
    Object.setPrototypeOf(this, LotError.prototype);
  }
}

export class BidError extends AppError {
  constructor(message: string, code: string = 'BID_ERROR', details?: Record<string, unknown>) {
    super(message, 400, code, details);
    Object.setPrototypeOf(this, BidError.prototype);
  }
}

export class WalletError extends AppError {
  constructor(message: string, code: string = 'WALLET_ERROR', details?: Record<string, unknown>) {
    super(message, 400, code, details);
    Object.setPrototypeOf(this, WalletError.prototype);
  }
}

export class SettlementError extends AppError {
  constructor(message: string, code: string = 'SETTLEMENT_ERROR', details?: Record<string, unknown>) {
    super(message, 400, code, details);
    Object.setPrototypeOf(this, SettlementError.prototype);
  }
}

export const errorCodes = {
  // Authentication
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  REFRESH_TOKEN_EXPIRED: 'REFRESH_TOKEN_EXPIRED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',

  // Authorization
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  SELLER_ONLY: 'SELLER_ONLY',
  ADMIN_ONLY: 'ADMIN_ONLY',

  // Auction
  AUCTION_NOT_FOUND: 'AUCTION_NOT_FOUND',
  AUCTION_NOT_LIVE: 'AUCTION_NOT_LIVE',
  AUCTION_ENDED: 'AUCTION_ENDED',
  AUCTION_NOT_STARTED: 'AUCTION_NOT_STARTED',
  AUCTION_CANCELLED: 'AUCTION_CANCELLED',
  RESERVE_NOT_MET: 'RESERVE_NOT_MET',
  BELOW_MINIMUM_BID: 'BELOW_MINIMUM_BID',
  BELOW_BID_INCREMENT: 'BELOW_BID_INCREMENT',
  CANNOT_BID_OWN_AUCTION: 'CANNOT_BID_OWN_AUCTION',
  AUTO_BID_EXCEEDED: 'AUTO_BID_EXCEEDED',

  // Bid
  BID_NOT_FOUND: 'BID_NOT_FOUND',
  BID_ALREADY_PROCESSED: 'BID_ALREADY_PROCESSED',
  INVALID_BID_AMOUNT: 'INVALID_BID_AMOUNT',

  // Wallet
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  INVALID_TRANSACTION: 'INVALID_TRANSACTION',
  HOLD_AMOUNT_EXCEEDS_BALANCE: 'HOLD_AMOUNT_EXCEEDS_BALANCE',

  // Settlement
  SETTLEMENT_NOT_FOUND: 'SETTLEMENT_NOT_FOUND',
  SETTLEMENT_ALREADY_PROCESSED: 'SETTLEMENT_ALREADY_PROCESSED',
  CANNOT_SETTLE: 'CANNOT_SETTLE',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_ID_FORMAT: 'INVALID_ID_FORMAT',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
} as const;