import type { Metadata } from "next";
import styles from "../auth.module.css";
import { AccountView } from "./account-view";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return (
    <main className={styles.page}>
      <section className={styles.marquee}>
        <p className={styles.brand}>TicketRush</p>
        <p className={styles.eyebrow}>
          <span className={styles.live} aria-hidden="true" />
          Box office open
        </p>
        <h1 className={styles.headline}>
          Your <span>account.</span>
        </h1>
        <p className={styles.lede}>Your details today; your seat holds and e-tickets as soon as events go on sale.</p>
      </section>
      <AccountView />
    </main>
  );
}
