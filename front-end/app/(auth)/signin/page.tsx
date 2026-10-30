import type { Metadata } from "next";
import styles from "../auth.module.css";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className={styles.page}>
      <section className={styles.marquee}>
        <p className={styles.brand}>TicketRush</p>
        <p className={styles.eyebrow}>
          <span className={styles.live} aria-hidden="true" />
          Box office open
        </p>
        <h1 className={styles.headline}>
          Back in <span>line.</span>
        </h1>
        <p className={styles.lede}>
          Sign in to pick up where you left off: your seat holds, the live seat map and your e-tickets.
        </p>
      </section>
      <SignInForm />
    </main>
  );
}
