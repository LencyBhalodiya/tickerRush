import type { Metadata } from "next";
import styles from "../auth.module.css";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <main className={styles.page}>
      <section className={styles.marquee}>
        <p className={styles.brand}>TicketRush</p>
        <p className={styles.eyebrow}>
          <span className={styles.live} aria-hidden="true" />
          Box office open
        </p>
        <h1 className={styles.headline}>
          Lost your <span>ticket?</span>
        </h1>
        <p className={styles.lede}>Tell us your email and we&rsquo;ll send you a link to choose a new password.</p>
      </section>
      <ForgotPasswordForm />
    </main>
  );
}
