import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { config } from "./config/env.js";
import { logger } from "./config/logger.js";

async function startServer(): Promise<void> {
  await connectDatabase();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, "HTTP server started");
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Graceful shutdown started");
    server.close(async () => {
      await disconnectDatabase();
      logger.info("Graceful shutdown completed");
      process.exit(0);
    });
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

void startServer();
