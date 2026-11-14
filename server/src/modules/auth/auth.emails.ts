import { setTimeout as sleep } from "node:timers/promises";
import { Queue, Worker, type Job } from "bullmq";
import type { HydratedDocument } from "mongoose";
import { AppError } from "../../common/errors/app-error.js";
import { config } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { sendEmail } from "../../config/mailer.js";
import { AuthTokenModel, type AuthTokenType } from "./auth-token.model.js";
import { AuthAccountModel, type AuthAccount } from "./auth.model.js";
import { createLinkToken, hashToken } from "./auth.tokens.js";

// A job says who to email and why, never the link: a token sitting in Redis would undo storing only its hash.
// The worker looks the account up, so the API does the same work (one add) for every email address.
type EmailJob = { kind: "verification" | "password_reset" | "signup_taken"; email: string };

export type LinkType = Exclude<AuthTokenType, "refresh">;

// Where each kind of emailed link lands on the front-end, and how long it works.
// Reset links are short-lived: one in the wrong hands takes over the account.
const LINKS: Record<LinkType, { path: string; ttlMs: number }> = {
  email_verification: { path: "/verify-email", ttlMs: 24 * 60 * 60 * 1000 },
  password_reset: { path: "/reset-password", ttlMs: 60 * 60 * 1000 },
};

const QUEUE_NAME = "auth-emails";
// Tests use the same Redis as `npm run dev`. Separate key prefixes keep each worker away from the other's jobs,
// like the separate test database in MongoDB.
const prefix = config.NODE_ENV === "test" ? "test" : "bull";

export const authEmailQueue = new Queue<EmailJob>(QUEUE_NAME, {
  prefix,
  // Without Redis, add() gives up after two reconnect attempts (about 2 s): long enough to ride out a Redis
  // restart, short enough that a request never hangs until Redis is back.
  connection: { url: config.REDIS_URL, maxRetriesPerRequest: 2 },
  defaultJobOptions: {
    // Six tries, waiting 30 s, 1, 2, 4 and 8 minutes in between: about 15 minutes of mail-server trouble.
    attempts: 6,
    backoff: { type: "exponential", delay: 30_000 },
    // Jobs hold an email address, so don't keep them long: sent ones for a day (100 at most), failures for a week.
    // BullMQ trims only when a later job finishes, so on a quiet queue they stay a little longer.
    removeOnComplete: { age: 24 * 60 * 60, count: 100 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  },
});

// BullMQ reconnects by itself and reports each failed attempt (about one a second while Redis is down).
// Without this listener it prints them raw with console.error, bypassing the logger.
authEmailQueue.on("error", (error) => logger.error({ event: "redis_error", err: error }, "Redis connection error"));

// Called before the server listens, like MongoDB, so a missing Redis stops startup instead of failing sign-ups.
// BullMQ would wait for Redis forever, so give up after 10 seconds.
export async function connectEmailQueue(): Promise<void> {
  const ready = await Promise.race([
    authEmailQueue.waitUntilReady().then(() => true),
    sleep(10_000, false, { ref: false }),
  ]);
  // No URL in the message: it can hold the Redis password.
  if (!ready) throw new Error("Redis did not answer within 10 seconds; check REDIS_URL and that Redis is running");
  logger.info({ queue: authEmailQueue.name }, "Connected to Redis");
}

// Awaited by the API: once this returns, the email is saved in Redis and will be sent, even after a restart.
export async function queueEmail(job: EmailJob): Promise<void> {
  try {
    await authEmailQueue.add(job.kind, job);
  } catch (error) {
    logger.error({ event: "email_queue_failed", kind: job.kind, err: error }, "Could not queue email");
    throw new AppError(503, "We can't send emails right now. Please try again in a minute.", "EMAIL_UNAVAILABLE");
  }
}

// Runs inside the API process for now. It needs only Redis, MongoDB and SMTP, so it can move to its own process
// later without changes.
export function startEmailWorker(): Worker<EmailJob> {
  const worker = new Worker<EmailJob>(QUEUE_NAME, sendJob, {
    prefix,
    connection: { url: config.REDIS_URL },
    concurrency: 5,
    // ponytail: 10 a second is a guess; set it from the SMTP provider's real sending limit.
    limiter: { max: 10, duration: 1000 },
  });
  worker.on("error", (error) => logger.error({ event: "redis_error", err: error }, "Redis connection error"));
  // Fires for every failed try. BullMQ then retries it after the backoff delay, until attempts run out.
  worker.on("failed", (job, error) =>
    logger.error(
      { event: "email_failed", jobId: job?.id, kind: job?.data.kind, attempt: job?.attemptsMade, of: job?.opts.attempts, err: error },
      "Email failed",
    ),
  );
  return worker;
}

// Throwing anywhere in here fails this try, and BullMQ schedules the next one.
async function sendJob(job: Job<EmailJob>): Promise<void> {
  const { kind, email } = job.data;

  if (kind === "signup_taken") {
    // Tell the real owner, with a way in: if someone else registered this email first, a password reset makes the
    // account theirs. Never a verification link here: it would verify whoever registered this email first.
    await sendEmail({
      to: email,
      subject: "Someone tried to sign up with your email",
      text: [
        "Someone just tried to create a tickerRush account with this email address.",
        "",
        "If it was you: you already have an account, so sign in instead.",
        `Forgot your password, or can't sign in? Reset it here: ${new URL("/forgot-password", config.CORS_ORIGIN).href}`,
        "",
        "If it wasn't you: your account is safe and nothing has changed. You can ignore this email.",
      ].join("\n"),
    });
    return;
  }

  const account = await AuthAccountModel.findOne({ email });
  // Unknown email, or already confirmed: nothing to send. The API gave the same reply either way.
  if (!account || (kind === "verification" && account.emailVerifiedAt)) return;

  // The name is left out on purpose: anyone can sign up with someone else's address and put a phishing line in it.
  if (kind === "verification") {
    const link = await createLink(account, "email_verification");
    await sendEmail({
      to: email,
      subject: "Confirm your email for tickerRush",
      text: [
        "Confirm your email address to finish signing up:",
        link.href,
        "",
        "The link works once and expires in 24 hours. If you didn't sign up, ignore this email.",
      ].join("\n"),
    });
  } else {
    const link = await createLink(account, "password_reset");
    await sendEmail({
      to: email,
      subject: "Reset your tickerRush password",
      text: [
        "Someone asked to reset the password for this email address. Choose a new password here:",
        link.href,
        "",
        "The link works once and expires in 1 hour. If you didn't ask, ignore this email: your password hasn't changed.",
      ].join("\n"),
    });
  }
  logger.info({ event: "link_emailed", kind, userId: account.id, jobId: job.id }, "Link emailed");
}

// A retry calls this again and makes a fresh link: the raw token of the last try was never stored anywhere.
async function createLink(account: HydratedDocument<AuthAccount>, type: LinkType): Promise<URL> {
  // Only the newest link of each kind works: a new one makes the earlier ones useless.
  await AuthTokenModel.deleteMany({ userId: account._id, type });
  const token = createLinkToken();
  await AuthTokenModel.create({
    tokenHash: hashToken(token),
    userId: account._id,
    type,
    expiresAt: new Date(Date.now() + LINKS[type].ttlMs),
  });

  // CORS_ORIGIN is the front-end's address. The link opens a page there, which POSTs the token back to the API.
  const link = new URL(LINKS[type].path, config.CORS_ORIGIN);
  link.searchParams.set("token", token);
  return link;
}
