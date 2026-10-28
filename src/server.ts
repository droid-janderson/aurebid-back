import { initializeApp } from "./app";
import { env } from "./config/env";
import { disconnectDatabase } from "./config/database";
import { initializeSocketServer } from "./sockets/socket.server";
import {
  startAuctionScheduler,
  stopAuctionScheduler,
} from "./jobs/auction-scheduler";

const port = Number(env.port ?? 3000);

const startServer = async (): Promise<void> => {
  try {
    const app = await initializeApp();

    const server = app.listen(port, "0.0.0.0", () => {
      console.log(
        `
🚀 Server running in ${env.nodeEnv} mode
📡 Listening on port ${env.port}
🔗 API: http://localhost:${env.port}${env.apiPrefix}
🏥 Health: http://localhost:${env.port}/health
📚 Docs: http://localhost:${env.port}/docs
📄 OpenAPI JSON: http://localhost:${env.port}/docs.json
🔌 WebSocket: ws://localhost:${env.port}
      `.trim(),
      );
    });

    initializeSocketServer(server);
    console.log("🔌 Socket.io server initialized");

    await startAuctionScheduler();

    const shutdown = async (signal: string): Promise<void> => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);

      stopAuctionScheduler();

      server.close(async () => {
        console.log("HTTP server closed");
        await disconnectDatabase();
        console.log("Database disconnected");
        process.exit(0);
      });

      setTimeout(() => {
        console.error("Forced shutdown after timeout");
        process.exit(1);
      }, 30000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    process.on("uncaughtException", (error) => {
      console.error("Uncaught Exception:", error);
      shutdown("UNCAUGHT_EXCEPTION");
    });

    process.on("unhandledRejection", (reason) => {
      console.error("Unhandled Rejection:", reason);
      shutdown("UNHANDLED_REJECTION");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
