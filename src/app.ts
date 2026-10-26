import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import {
  errorHandler,
  notFoundHandler,
  asyncHandler,
} from "./shared/middlewares";
import { ApiResponse } from "./shared/types";
import { connectDatabase } from "./config/database";
import routes from "./routes";
import swaggerUi from "swagger-ui-express";
import { swaggerDocument, swaggerUiOptions } from "./docs/swagger";
import { buildPostmanCollection } from "./docs/postman";
import { swaggerCustomJs } from "./docs/swagger-custom";

export function createApp(): Application {
  const app = express();

  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    }),
  );

  // CORS
  app.use(
    cors({
      origin: env.cors.origin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    }),
  );

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  if (env.nodeEnv !== "test") {
    app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));
  }

  const postmanCollection = buildPostmanCollection(swaggerDocument);

  app.get("/docs.json", (_req: Request, res: Response) => {
    res.json(swaggerDocument);
  });
  app.get("/docs/openapi.json", (_req: Request, res: Response) => {
    res.attachment("aurebid.openapi.json");
    res.json(swaggerDocument);
  });
  app.get("/docs/postman.json", (_req: Request, res: Response) => {
    res.attachment("aurebid.postman_collection.json");
    res.json(postmanCollection);
  });
  app.get("/docs/postman-export.js", (_req: Request, res: Response) => {
    res.type("application/javascript").send(swaggerCustomJs);
  });
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, swaggerUiOptions),
  );

  const limiter = rateLimit({
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.maxRequests,
    message: {
      success: false,
      message: "Too many requests, please try again later",
      error: "RATE_LIMIT_EXCEEDED",
    } as ApiResponse,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Health check endpoint
  app.get(
    "/health",
    asyncHandler(async (req: Request, res: Response) => {
      const response: ApiResponse = {
        success: true,
        message: "Service healthy",
        data: {
          status: "ok",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: env.nodeEnv,
        },
      };
      res.json(response);
    }),
  );

  app.use(env.apiPrefix, routes);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}

// Initialize database connection
export async function initializeApp(): Promise<Application> {
  await connectDatabase();
  return createApp();
}
