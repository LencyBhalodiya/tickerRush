"use client";

import Link from "next/link";
import { useSession } from "../../session";
import styles from "../auth.module.css";
import { Ticket } from "../ticket-form";

export function AccountView() {
  const [session] = useSession();

  if (!session) {
    return (
      <Ticket>
        <div className={styles.success}>
          <p className={styles.kicker}>No ticket on file</p>
          <h2 className={styles.title}>You&rsquo;re not signed in.</h2>
          <p className={styles.successText}>Sign in to see your account.</p>
          <Link href="/signin" className={styles.submit}>
            <span>Sign in</span>
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </Ticket>
    );
  }

  const { user } = session;
  return (
    <Ticket>
      <div className={styles.success}>
        <span className={styles.stamp} aria-hidden="true">
          Admitted
        </span>
        <p className={styles.kicker}>Admit one · Signed in</p>
        <h2 className={styles.title}>Signed in as {user.name}.</h2>
        <dl className={styles.details}>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Member type</dt>
            <dd>{user.role === "admin" ? "Admin" : "Member"}</dd>
          </div>
        </dl>
      </div>
    </Ticket>
  );
}
