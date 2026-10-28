import dotenv from "dotenv";

dotenv.config();

interface EnvConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  databaseUrl: string;
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  cors: {
    origin: string;
  };
  socket: {
    corsOrigin: string;
  };
  pseudonym: {
    secret: string;
  };
  auction: {
    sweepIntervalMs: number;
  };
  settlement: {
    maxAttempts: number;
  };
}

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value || defaultValue!;
};

const getNumberEnv = (key: string, defaultValue?: number): number => {
  const value = process.env[key];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Environment variable ${key} is not set`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
};

export const env: EnvConfig = {
  nodeEnv: getEnv("NODE_ENV", "development"),
  port: getNumberEnv("PORT", 3000),
  apiPrefix: getEnv("API_PREFIX", "/api/v1"),
  databaseUrl: getEnv("DATABASE_URL"),
  jwt: {
    secret: getEnv("JWT_SECRET"),
    expiresIn: getEnv("JWT_EXPIRES_IN", "15m"),
    refreshSecret: getEnv("JWT_REFRESH_SECRET"),
    refreshExpiresIn: getEnv("JWT_REFRESH_EXPIRES_IN", "7d"),
  },
  cors: {
    origin: getEnv("CORS_ORIGIN", "http://localhost:3001"),
  },
  socket: {
    corsOrigin: getEnv("SOCKET_IO_CORS_ORIGIN", "http://localhost:3001"),
  },

  pseudonym: {
    secret: getEnv("PSEUDONYM_SECRET", getEnv("JWT_SECRET")),
  },
  auction: {
    sweepIntervalMs: getNumberEnv("AUCTION_SWEEP_INTERVAL_MS", 30000),
  },
  settlement: {
    maxAttempts: getNumberEnv("SETTLEMENT_MAX_ATTEMPTS", 5),
  },
};

export const isDevelopment = env.nodeEnv === "development";
export const isProduction = env.nodeEnv === "production";
export const isTest = env.nodeEnv === "test";
