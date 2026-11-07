import type { Metadata } from "next";
import styles from "../auth.module.css";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
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
          New <span>password.</span>
        </h1>
        <p className={styles.lede}>Choose a new password. Saving it signs you out on every device.</p>
      </section>
      {/* ?token=a&token=b arrives as an array: treat it like a broken link. */}
      <ResetPasswordForm token={typeof token === "string" ? token : undefined} />
    </main>
  );
}
