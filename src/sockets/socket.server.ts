import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../config/database";
import { JWTPayload } from "../shared/types";
import { formatDecimal } from "../shared/utils";
import { publicActorLabel, serverTimeIso } from "../shared/utils/privacy";

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  batchRooms: Set<string>;
}

let io: SocketIOServer | null = null;

export type WalletChangeReason =
  | "RESERVATION_HELD"
  | "RESERVATION_UPDATED"
  | "RESERVATION_RELEASED"
  | "RESERVATION_CONSUMED"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "SETTLEMENT";

export interface WalletChangedPayload {
  reason: WalletChangeReason;
  batchId?: string;
  serverTime: string;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function initializeSocketServer(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.socket.corsOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use(async (socket: any, next) => {
    socket.batchRooms = new Set();

    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.split(" ")[1];

      if (!token) {
        return next();
      }

      const decoded = jwt.verify(token, env.jwt.secret) as JWTPayload;

      if (decoded.type !== "access") {
        return next(new Error("Invalid token type"));
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, email: true, name: true, role: true },
      });

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };

      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: any) => {
    const authSocket = socket as AuthenticatedSocket;
    const actor = authSocket.user?.name ?? "visitante";

    if (authSocket.user) {
      socket.join(`user:${authSocket.user.id}`);
    }

    console.log(`Socket connected: ${actor} (${socket.id})`);

    socket.on("auction:join", async (batchId: string) => {
      try {
        const batch = await prisma.batch.findUnique({
          where: { id: batchId },
          include: {
            bids: {
              orderBy: { amount: "desc" },
              take: 1,
              select: { amount: true },
            },
            _count: { select: { bids: true } },
          },
        });

        if (!batch || batch.deletedAt) {
          socket.emit("error", { message: "Batch not found" });
          return;
        }

        socket.join(`auction:${batchId}`);
        authSocket.batchRooms.add(batchId);

        const now = Date.now();

        socket.emit("auction:state", {
          batchId,
          status: batch.status,
          currentPrice: batch.bids[0]
            ? formatDecimal(batch.bids[0].amount)
            : formatDecimal(batch.startingPrice),
          bidCount: batch._count.bids,
          endsAt: batch.endsAt.toISOString(),
          startsAt: batch.startsAt.toISOString(),
          timeRemaining: Math.max(
            0,
            new Date(batch.endsAt).getTime() - now,
          ),
          serverTime: serverTimeIso(),
        });

        console.log(`${actor} joined batch ${batchId}`);
      } catch {
        socket.emit("error", { message: "Failed to join batch" });
      }
    });

    socket.on("auction:leave", (batchId: string) => {
      socket.leave(`auction:${batchId}`);
      authSocket.batchRooms.delete(batchId);
      console.log(`${actor} left batch ${batchId}`);
    });

    socket.on("bid:place", () => {
      socket.emit("error", {
        message: "Place bids through POST /api/v1/auctions/:id/bids",
      });
    });
    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${actor} (${socket.id})`);
    });
  });

  return io;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}

export const auctionSocket = {
  emitNewBid: (batchId: string, bid: any) => {
    if (!io) return;
    io.to(`auction:${batchId}`).emit("bid:new", {
      batchId,
      bid: {
        id: bid.id,
        amount: formatDecimal(bid.amount),
        createdAt: bid.createdAt,
        bidder: {
          label: bid.bidderId
            ? publicActorLabel(batchId, bid.bidderId, "bidder")
            : null,
        },
      },
      serverTime: serverTimeIso(),
    });
  },

  emitAuctionStatusChange: (batch: any) => {
    if (!io) return;
    io.to(`auction:${batch.id}`).emit("auction:status_change", {
      batchId: batch.id,
      status: batch.status,
      startsAt: toIsoString(batch.startsAt),
      endsAt: toIsoString(batch.endsAt),
      serverTime: serverTimeIso(),
    });
  },

  emitAuctionEnded: (batch: any) => {
    if (!io) return;
    const winnerBid = batch?.bids?.[0] ?? null;

    io.to(`auction:${batch.id}`).emit("auction:ended", {
      batchId: batch.id,
      status: batch.status,
      winner: winnerBid
        ? {
            label: publicActorLabel(
              batch.id,
              winnerBid.bidderId ?? winnerBid.bidder?.id,
              "bidder",
            ),
          }
        : null,
      finalPrice: winnerBid ? formatDecimal(winnerBid.amount) : null,
      serverTime: serverTimeIso(),
    });
  },

  emitAuctionExtended: (
    batchId: string,
    endsAt: Date,
    extendedBy: number,
  ) => {
    if (!io) return;
    io.to(`auction:${batchId}`).emit("auction:extended", {
      batchId,
      endsAt: endsAt.toISOString(),
      extendedBy,
      serverTime: serverTimeIso(),
    });
  },

  emitAuctionTimer: (batchId: string, timeRemaining: number) => {
    if (!io) return;
    io.to(`auction:${batchId}`).emit("auction:timer", {
      batchId,
      timeRemaining,
      serverTime: serverTimeIso(),
    });
  },

  emitWalletChanged: (
    userId: string,
    change: { reason: WalletChangeReason; batchId?: string },
  ) => {
    if (!io) return;
    const payload: WalletChangedPayload = {
      reason: change.reason,
      ...(change.batchId ? { batchId: change.batchId } : {}),
      serverTime: serverTimeIso(),
    };
    io.to(`user:${userId}`).emit("wallet:changed", payload);
  },

  broadcastToAll: (event: string, data: any) => {
    if (!io) return;
    io.emit(event, data);
  },
};
