import nodemailer from "nodemailer";
import { config } from "./env.js";
import { logger } from "./logger.js";

// Tests send nothing: jsonTransport builds the message and stops there.
const transport = nodemailer.createTransport(
  config.NODE_ENV === "test"
    ? { jsonTransport: true }
    : {
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        // Port 465 is encrypted from the first byte. Other ports start in plain text and upgrade with STARTTLS;
        // requireTLS refuses to go on without that upgrade, so the SMTP password never crosses the network in clear.
        secure: config.SMTP_PORT === 465,
        requireTLS: true,
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
        // nodemailer waits up to 2 minutes to connect and 10 for a silent server. A hung send holds one of the
        // email worker's few slots, so fail sooner and let the job's retry try again.
        connectionTimeout: 10_000,
        socketTimeout: 30_000,
      },
);

type Email = { to: string; subject: string; text: string };

// Called by the email worker (auth.emails.ts), never by a request: a failure throws, and BullMQ retries the job.
export async function sendEmail(email: Email): Promise<void> {
  const info = await transport.sendMail({ from: config.MAIL_FROM, ...email });
  // Ethereal only: a link to read the email in the browser. Real providers return false.
  const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
  logger.info({ event: "email_sent", messageId: info.messageId, previewUrl }, "Email sent");
}
