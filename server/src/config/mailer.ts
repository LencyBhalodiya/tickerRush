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
      },
);

type Email = { to: string; subject: string; text: string };

// Fire-and-forget: returns before the email goes out, so a slow or failing mail server never delays or fails a request.
// ponytail: an email is lost if sending fails or the process stops first; move to a BullMQ queue for retries.
export function sendEmail(email: Email): void {
  transport.sendMail({ from: config.MAIL_FROM, ...email }).then(
    (info) => {
      // Ethereal only: a link to read the email in the browser. Real providers return false.
      const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      logger.info({ event: "email_sent", messageId: info.messageId, previewUrl }, "Email sent");
    },
    (error: unknown) => logger.error({ event: "email_failed", err: error }, "Email failed"),
  );
}
