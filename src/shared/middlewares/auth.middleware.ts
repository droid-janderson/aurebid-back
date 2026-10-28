import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { AuthenticationError, AuthorizationError } from "../../shared/errors";
import { AuthUser, JWTPayload, RequestWithUser } from "../../shared/types";

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AuthenticationError("Access token required");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.jwt.secret) as JWTPayload;

    if (decoded.type !== "access") {
      throw new AuthenticationError("Invalid token type");
    }

    (req as RequestWithUser).user = {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name || "",
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError("Token expired", { code: "TOKEN_EXPIRED" });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError("Invalid token", { code: "TOKEN_INVALID" });
    }
    throw error;
  }
}

export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    throw new AuthenticationError("Invalid token", { code: "TOKEN_INVALID" });
  }

  try {
    const decoded = jwt.verify(token, env.jwt.secret) as JWTPayload;

    if (decoded.type !== "access") {
      throw new AuthenticationError("Invalid token type", {
        code: "TOKEN_INVALID",
      });
    }

    (req as RequestWithUser).user = {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name || "",
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError("Token expired", { code: "TOKEN_EXPIRED" });
    }
    throw new AuthenticationError("Invalid token", { code: "TOKEN_INVALID" });
  }
}

export function authorize(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as RequestWithUser).user;

    if (!user) {
      throw new AuthenticationError("Authentication required");
    }

    if (!allowedRoles.includes(user.role)) {
      throw new AuthorizationError("Insufficient permissions");
    }

    next();
  };
}

export function authorizeResource(resourceUserId: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as RequestWithUser).user;

    if (!user) {
      throw new AuthenticationError("Authentication required");
    }

    if (user.role !== "ADMIN" && user.id !== resourceUserId) {
      throw new AuthorizationError("Access denied to this resource");
    }

    next();
  };
}

export async function getUserFromToken(
  token: string,
): Promise<AuthUser | null> {
  try {
    const decoded = jwt.verify(token, env.jwt.secret) as JWTPayload;

    if (decoded.type !== "access") {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  } catch {
    return null;
  }
}

export function generateTokens(user: AuthUser): {
  accessToken: string;
  refreshToken: string;
} {
  const accessPayload: Omit<JWTPayload, "iat" | "exp"> = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    type: "access",
  };

  const refreshPayload: Omit<JWTPayload, "iat" | "exp"> = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    type: "refresh",
  };

  const accessToken = jwt.sign(accessPayload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as any,
  });

  const refreshToken = jwt.sign(refreshPayload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn as any,
  });

  return { accessToken, refreshToken };
}

export function verifyRefreshToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwt.refreshSecret) as JWTPayload;

    if (decoded.type !== "refresh") {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}
