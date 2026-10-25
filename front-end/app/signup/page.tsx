import type { Metadata } from "next";
import { SignupForm } from "./signup-form";
import styles from "./signup.module.css";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <main className={styles.page}>
      <section className={styles.marquee}>
        <p className={styles.brand}>TicketRush</p>
        <p className={styles.eyebrow}>
          <span className={styles.live} aria-hidden="true" />
          Box office open
        </p>
        <h1 className={styles.headline}>
          Be first <span>in line.</span>
        </h1>
        <p className={styles.lede}>
          Create an account to hold seats while you decide, watch the seat map fill up live, and get your
          e-ticket the moment you book.
        </p>
        <ul className={styles.perks}>
          <li>10-min seat holds</li>
          <li>Live seat maps</li>
          <li>Instant e-tickets</li>
        </ul>
      </section>
      <SignupForm />
    </main>
  );
}
