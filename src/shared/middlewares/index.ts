import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  AuctionError,
  BidError,
  WalletError,
  SettlementError,
} from "../errors";
import { ApiResponse } from "../types";
import { env } from "../../config/env";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  console.error("Error:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  if (err instanceof ZodError) {
    const errors = err.issues.map((e) => ({
      field: e.path.join("."),
      message: e.message,
      code: e.code,
    }));
    const response: ApiResponse = {
      success: false,
      message: "Validation failed",
      errors,
    };
    res.status(400).json(response);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    handlePrismaError(err, res);
    return;
  }

  if (err instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      message: err.message,
      error: err.code,
      details: err.details,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  const statusCode = 500;
  const message =
    env.nodeEnv === "production" ? "Internal server error" : err.message;
  const response: ApiResponse = {
    success: false,
    message,
    error: "INTERNAL_ERROR",
  };
  res.status(statusCode).json(response);
};

function handlePrismaError(
  err: Prisma.PrismaClientKnownRequestError,
  res: Response,
): void {
  let message = "Database error";
  let statusCode = 500;
  let code = "DATABASE_ERROR";

  switch (err.code) {
    case "P2002": {
      const target = (err.meta?.target as string[])?.join(", ") || "field";
      message = `A record with this ${target} already exists`;
      statusCode = 409;
      code = "DUPLICATE_ENTRY";
      break;
    }
    case "P2025": {
      message = "Record not found";
      statusCode = 404;
      code = "NOT_FOUND";
      break;
    }
    case "P2003": {
      message = "Foreign key constraint failed";
      statusCode = 400;
      code = "FOREIGN_KEY_ERROR";
      break;
    }
    case "P2014": {
      message = "Relation violation";
      statusCode = 400;
      code = "RELATION_ERROR";
      break;
    }
  }

  const response: ApiResponse = {
    success: false,
    message,
    error: code,
    details: { prismaCode: err.code, meta: err.meta },
  };
  res.status(statusCode).json(response);
}

export const notFoundHandler = (req: Request, res: Response): void => {
  const response: ApiResponse = {
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
    error: "NOT_FOUND",
  };
  res.status(404).json(response);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const validate = (schema: any) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      next(error);
    }
  };
};
