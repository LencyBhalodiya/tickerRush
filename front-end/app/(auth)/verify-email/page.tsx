import type { Metadata } from "next";
import styles from "../auth.module.css";
import { VerifyEmailView } from "./verify-email-view";

export const metadata: Metadata = { title: "Confirm your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <main className={styles.page}>
      <section className={styles.marquee}>
        <p className={styles.brand}>TicketRush</p>
        <p className={styles.eyebrow}>
          <span className={styles.live} aria-hidden="true" />
          Box office open
        </p>
        <h1 className={styles.headline}>
          One last <span>check.</span>
        </h1>
        <p className={styles.lede}>Confirm this email address is yours, then sign in to get in line.</p>
      </section>
      {/* ?token=a&token=b arrives as an array: treat it like a broken link. */}
      <VerifyEmailView token={typeof token === "string" ? token : undefined} />
    </main>
  );
}
