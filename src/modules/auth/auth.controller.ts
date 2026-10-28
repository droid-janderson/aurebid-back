import { Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/database";
import { asyncHandler } from "../../shared/middlewares";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors";
import { RequestWithUser } from "../../shared/types";
import {
  generateTokens,
  verifyRefreshToken,
} from "../../shared/middlewares/auth.middleware";
import {
  parsePaginationParams,
  buildPaginatedResponse,
} from "../../shared/utils";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const register = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { email, password, name, role } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictError("User with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          role,
        },
        select: publicUserSelect,
      });

      await tx.wallet.create({
        data: { userId: created.id, balance: 0 },
      });

      return created;
    });

    const { accessToken, refreshToken } = generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user,
        accessToken,
        refreshToken,
      },
    });
  },
);

export const login = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new AuthenticationError("Invalid credentials", {
        code: "INVALID_CREDENTIALS",
      });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError("Invalid credentials", {
        code: "INVALID_CREDENTIALS",
      });
    }

    const { accessToken, refreshToken } = generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
    });
  },
);

export const refreshToken = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { refreshToken: token } = req.body;

    const decoded = verifyRefreshToken(token);
    if (!decoded) {
      throw new AuthenticationError("Invalid refresh token", {
        code: "REFRESH_TOKEN_INVALID",
      });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) {
      throw new AuthenticationError("Invalid refresh token", {
        code: "REFRESH_TOKEN_INVALID",
      });
    }

    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json({
      success: true,
      message: "Tokens refreshed",
      data: tokens,
    });
  },
);

export const logout = asyncHandler(
  async (_req: RequestWithUser, res: Response) => {
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  },
);

export const getMe = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        ...publicUserSelect,
        wallet: {
          select: {
            id: true,
            balance: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!fullUser) {
      throw new NotFoundError("User");
    }

    res.json({
      success: true,
      data: fullUser,
    });
  },
);

export const updateProfile = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { name } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { name },
      select: publicUserSelect,
    });

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
    });
  },
);

export const changePassword = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { currentPassword, newPassword } = req.body;

    const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!fullUser) {
      throw new NotFoundError("User");
    }

    const isValid = await bcrypt.compare(
      currentPassword,
      fullUser.passwordHash,
    );
    if (!isValid) {
      throw new ValidationError("Current password is incorrect", [
        {
          field: "currentPassword",
          message: "Current password is incorrect",
          code: "INVALID_PASSWORD",
        },
      ]);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    res.json({
      success: true,
      message: "Password changed successfully. Please login again.",
    });
  },
);

export const listUsers = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { page = 1, limit = 20, search, role } = req.query;

    const {
      page: pageNum,
      limit: limitNum,
      skip,
    } = parsePaginationParams(page, limit);

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: "insensitive" } },
        { name: { contains: search as string, mode: "insensitive" } },
      ];
    }
    if (role) where.role = role;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        select: {
          ...publicUserSelect,
          wallet: { select: { id: true, balance: true } },
          _count: {
            select: { batchs: true, bids: true, purchases: true, sales: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: users,
      meta: buildPaginatedResponse(users, total, pageNum, limitNum).meta,
    });
  },
);

export const getUserById = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        ...publicUserSelect,
        wallet: {
          select: {
            id: true,
            balance: true,
            reservations: {
              where: { status: "ACTIVE" },
              select: { id: true, batchId: true, amount: true, status: true },
            },
          },
        },
        _count: {
          select: { batchs: true, bids: true, purchases: true, sales: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundError("User");
    }

    res.json({
      success: true,
      data: user,
    });
  },
);

export const updateUserRole = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;
    const { role } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError("User");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: publicUserSelect,
    });

    res.json({
      success: true,
      message: "User role updated",
      data: updated,
    });
  },
);

export const deleteUser = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        wallet: {
          select: {
            id: true,
            _count: { select: { transactions: true, reservations: true } },
          },
        },
        _count: {
          select: { batchs: true, bids: true, purchases: true, sales: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundError("User");
    }

    const { batchs, bids, purchases, sales } = user._count;
    if (batchs > 0 || bids > 0 || purchases > 0 || sales > 0) {
      throw new ConflictError(
        "Cannot delete a user with batchs, bids or settlements",
      );
    }

    if (
      user.wallet &&
      (user.wallet._count.transactions > 0 ||
        user.wallet._count.reservations > 0)
    ) {
      throw new ConflictError("Cannot delete a user with wallet history");
    }

    await prisma.$transaction(async (tx) => {
      if (user.wallet) {
        await tx.wallet.delete({ where: { id: user.wallet.id } });
      }
      await tx.user.delete({ where: { id } });
    });

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  },
);
