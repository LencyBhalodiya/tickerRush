import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { config } from "./config/env.js";
import { logger } from "./config/logger.js";
import { authEmailQueue, connectEmailQueue, startEmailWorker } from "./modules/auth/auth.emails.js";

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    await connectEmailQueue();
    const emailWorker = startEmailWorker();
    const server = app.listen(config.PORT, () => {
      logger.info({ port: config.PORT }, "HTTP server started");
    });

    let isShuttingDown = false;

    const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info({ signal }, "Graceful shutdown started");
      server.close(async (closeError) => {
        if (closeError) {
          logger.error({ err: closeError }, "Failed to close HTTP server");
          exitCode = 1;
        }

        try {
          // Waits for the emails being sent right now; queued ones stay in Redis for the next start.
          await emailWorker.close();
          await authEmailQueue.close();
          await disconnectDatabase();
          logger.info({ signal }, "Graceful shutdown completed");
        } catch (error) {
          logger.error({ err: error }, "Failed to disconnect from Redis or MongoDB");
          exitCode = 1;
        } finally {
          process.exit(exitCode);
        }
      });
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    
    process.once("uncaughtException", (error) => {
      logger.fatal({ err: error }, "Uncaught exception");
      void shutdown("uncaughtException", 1);
    });
    process.once("unhandledRejection", (reason) => {
      logger.fatal({ err: reason }, "Unhandled promise rejection");
      void shutdown("unhandledRejection", 1);
    });
  } catch (error) {
    logger.fatal({ err: error }, "Failed to connect to MongoDB or Redis; server was not started");
    process.exit(1);
  }
}

void startServer();
