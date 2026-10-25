import mongoose from "mongoose";
import { config } from "./env.js";
import { logger } from "./logger.js";

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  logger.info("Connected to MongoDB");
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
