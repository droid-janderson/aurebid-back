import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../config/database";
import { JWTPayload } from "../shared/types";
import { formatDecimal } from "../shared/utils";

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
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.split(" ")[1];

      if (!token) {
        return next(new Error("Authentication required"));
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
      socket.batchRooms = new Set();

      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: any) => {
    const authSocket = socket as AuthenticatedSocket;
    console.log(`Socket connected: ${authSocket.user?.name} (${socket.id})`);

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

        if (!batch) {
          socket.emit("error", { message: "Batch not found" });
          return;
        }

        socket.join(`auction:${batchId}`);
        authSocket.batchRooms.add(batchId);

        socket.emit("auction:state", {
          batchId,
          status: batch.status,
          currentPrice: batch.bids[0]
            ? formatDecimal(batch.bids[0].amount)
            : formatDecimal(batch.startingPrice),
          bidCount: batch._count.bids,
          timeRemaining: Math.max(
            0,
            new Date(batch.endsAt).getTime() - Date.now(),
          ),
        });

        console.log(`User ${authSocket.user?.name} joined batch ${batchId}`);
      } catch {
        socket.emit("error", { message: "Failed to join batch" });
      }
    });

    socket.on("auction:leave", (batchId: string) => {
      socket.leave(`auction:${batchId}`);
      authSocket.batchRooms.delete(batchId);
      console.log(`User ${authSocket.user?.name} left batch ${batchId}`);
    });

    socket.on("bid:place", () => {
      socket.emit("error", {
        message: "Place bids through POST /api/v1/auctions/:id/bids",
      });
    });
    socket.on("disconnect", () => {
      console.log(
        `Socket disconnected: ${authSocket.user?.name} (${socket.id})`,
      );
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
          id: bid.bidder?.id,
          name: bid.bidder?.name,
        },
      },
    });
  },

  emitAuctionStatusChange: (batch: any) => {
    if (!io) return;
    io.to(`auction:${batch.id}`).emit("auction:status_change", {
      batchId: batch.id,
      status: batch.status,
      startsAt: batch.startsAt,
      endsAt: batch.endsAt,
    });
  },

  emitAuctionEnded: (batch: any) => {
    if (!io) return;
    const winner = batch?.bids?.[0]?.bidder ?? null;

    io.to(`auction:${batch.id}`).emit("auction:ended", {
      batchId: batch.id,
      status: batch.status,
      winner: winner ? { id: winner.id, name: winner.name } : null,
      finalPrice: batch?.bids?.[0] ? formatDecimal(batch.bids[0].amount) : null,
    });
  },

  emitAuctionTimer: (batchId: string, timeRemaining: number) => {
    if (!io) return;
    io.to(`auction:${batchId}`).emit("auction:timer", {
      batchId,
      timeRemaining,
    });
  },

  broadcastToAll: (event: string, data: any) => {
    if (!io) return;
    io.emit(event, data);
  },
};
