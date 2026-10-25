import mongoose from "mongoose";
import { config } from "./env.js";
import { logger } from "./logger.js";

mongoose.connection.on("error", (error) => {
  logger.error({ err: error }, "MongoDB connection error");
});

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB disconnected");
});

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(config.MONGODB_URI);
  logger.info({ database: mongoose.connection.name }, "Connected to MongoDB");
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
    await mongoose.disconnect();
    logger.info("Disconnected from MongoDB");
  }
}
