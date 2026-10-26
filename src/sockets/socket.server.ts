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
  lotRooms: Set<string>;
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
      socket.lotRooms = new Set();

      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: any) => {
    const authSocket = socket as AuthenticatedSocket;
    console.log(`Socket connected: ${authSocket.user?.name} (${socket.id})`);

    socket.on("auction:join", async (lotId: string) => {
      try {
        const lot = await prisma.lot.findUnique({
          where: { id: lotId },
          include: {
            bids: {
              orderBy: { amount: "desc" },
              take: 1,
              select: { amount: true },
            },
            _count: { select: { bids: true } },
          },
        });

        if (!lot) {
          socket.emit("error", { message: "Lot not found" });
          return;
        }

        socket.join(`auction:${lotId}`);
        authSocket.lotRooms.add(lotId);

        socket.emit("auction:state", {
          lotId,
          status: lot.status,
          currentPrice: lot.bids[0]
            ? formatDecimal(lot.bids[0].amount)
            : formatDecimal(lot.startingPrice),
          bidCount: lot._count.bids,
          timeRemaining: Math.max(
            0,
            new Date(lot.endsAt).getTime() - Date.now(),
          ),
        });

        console.log(`User ${authSocket.user?.name} joined lot ${lotId}`);
      } catch {
        socket.emit("error", { message: "Failed to join lot" });
      }
    });

    socket.on("auction:leave", (lotId: string) => {
      socket.leave(`auction:${lotId}`);
      authSocket.lotRooms.delete(lotId);
      console.log(`User ${authSocket.user?.name} left lot ${lotId}`);
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
  emitNewBid: (lotId: string, bid: any) => {
    if (!io) return;
    io.to(`auction:${lotId}`).emit("bid:new", {
      lotId,
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

  emitAuctionStatusChange: (lot: any) => {
    if (!io) return;
    io.to(`auction:${lot.id}`).emit("auction:status_change", {
      lotId: lot.id,
      status: lot.status,
      startsAt: lot.startsAt,
      endsAt: lot.endsAt,
    });
  },

  emitAuctionEnded: (lot: any) => {
    if (!io) return;
    const winner = lot?.bids?.[0]?.bidder ?? null;

    io.to(`auction:${lot.id}`).emit("auction:ended", {
      lotId: lot.id,
      status: lot.status,
      winner: winner ? { id: winner.id, name: winner.name } : null,
      finalPrice: lot?.bids?.[0] ? formatDecimal(lot.bids[0].amount) : null,
    });
  },

  emitAuctionTimer: (lotId: string, timeRemaining: number) => {
    if (!io) return;
    io.to(`auction:${lotId}`).emit("auction:timer", { lotId, timeRemaining });
  },

  broadcastToAll: (event: string, data: any) => {
    if (!io) return;
    io.emit(event, data);
  },
};
