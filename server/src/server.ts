import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { config } from "./config/env.js";
import { logger } from "./config/logger.js";

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    const server = app.listen(config.port, () => {
      logger.info({ port: config.port }, "HTTP server started");
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
          await disconnectDatabase();
          logger.info({ signal }, "Graceful shutdown completed");
        } catch (error) {
          logger.error({ err: error }, "Failed to disconnect from MongoDB");
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
    logger.fatal({ err: error }, "Failed to connect to MongoDB; server was not started");
    process.exit(1);
  }
}

void startServer();
