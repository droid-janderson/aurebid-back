import { createServer } from 'http';
import { createApp, initializeApp } from './app';
import { env } from './config/env';
import { disconnectDatabase } from './config/database';
import { initializeSocketServer } from './sockets/socket.server';
import { runAuctionJobs } from './jobs/close-auctions.job';

const startServer = async (): Promise<void> => {
  try {
    const app = await initializeApp();

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize Socket.io
    initializeSocketServer(httpServer);
    console.log('🔌 Socket.io server initialized');

    const server = httpServer.listen(env.port, () => {
      console.log(`
🚀 Server running in ${env.nodeEnv} mode
📡 Listening on port ${env.port}
🔗 API: http://localhost:${env.port}${env.apiPrefix}
🏥 Health: http://localhost:${env.port}/health
🔌 WebSocket: ws://localhost:${env.port}
      `.trim());
    });

    // Start auction jobs (every 30 seconds)
    const jobInterval = setInterval(() => {
      runAuctionJobs().catch(console.error);
    }, 30000);

    // Run once on startup
    runAuctionJobs().catch(console.error);

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);

      clearInterval(jobInterval);

      server.close(async () => {
        console.log('HTTP server closed');
        await disconnectDatabase();
        console.log('Database disconnected');
        process.exit(0);
      });

      // Force close after 30 seconds
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled Rejection:', reason);
      shutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();