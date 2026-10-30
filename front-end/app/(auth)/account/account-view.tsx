"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "../../api";
import { useSession } from "../../session";
import styles from "../auth.module.css";
import { Ticket } from "../ticket-form";

export function AccountView() {
  const router = useRouter();
  const [session, setSession] = useSession();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");

  async function handleSignOut() {
    setPending(true);
    setFormError("");
    try {
      const { res, data } = await postJson("/auth/logout", {});

      if (res.ok) {
        setSession(null);
        router.replace("/signin");
        return;
      }

      setFormError(data.message ?? "Something went wrong. Please try again.");
    } catch {
      setFormError("We can't reach the box office right now. Check your connection and try again.");
    }
    setPending(false);
  }

  if (session === undefined) {
    return (
      <Ticket>
        <div className={styles.success} aria-busy="true">
          <p className={styles.kicker}>Checking your ticket…</p>
        </div>
      </Ticket>
    );
  }

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
        {formError && (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        )}
        <button type="button" className={styles.submit} onClick={handleSignOut} disabled={pending}>
          <span>{pending ? "Signing out…" : "Sign out"}</span>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </Ticket>
  );
}
