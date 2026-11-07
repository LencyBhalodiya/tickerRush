"use client";

import Link from "next/link";
import { useState } from "react";
import { postJson } from "../../api";
import styles from "../auth.module.css";
import { Ticket } from "../ticket-form";

type Status = "ready" | "pending" | "verified" | "invalid";

// Confirming takes a button press, never a page load: email scanners open every link in an email,
// and a page that verified on load would let them use up the token before the user sees it.
export function VerifyEmailView({ token }: { token?: string }) {
  const [status, setStatus] = useState<Status>(token ? "ready" : "invalid");
  const [formError, setFormError] = useState("");

  async function handleConfirm() {
    setStatus("pending");
    setFormError("");
    try {
      const { res, data } = await postJson("/auth/verify-email", { token });

      if (res.ok) {
        setStatus("verified");
        return;
      }
      // 422 means the token isn't even token-shaped: as dead as an expired one.
      if (data.code === "INVALID_VERIFICATION_TOKEN" || res.status === 422) {
        setStatus("invalid");
        return;
      }
      setFormError(data.message ?? "Something went wrong. Please try again.");
    } catch {
      setFormError("We can't reach the box office right now. Check your connection and try again.");
    }
    setStatus("ready");
  }

  if (status === "verified") {
    return (
      <Ticket>
        <div className={styles.success}>
          <span className={styles.stamp} aria-hidden="true">
            Confirmed
          </span>
          <p className={styles.kicker}>Admit one · Email confirmed</p>
          <h2 className={styles.title}>You&rsquo;re all set.</h2>
          <p className={styles.successText}>Your email is confirmed. Sign in to take your seat.</p>
          <SignInLink />
        </div>
      </Ticket>
    );
  }

  if (status === "invalid") {
    return (
      <Ticket>
        <div className={styles.success}>
          <p className={styles.kicker}>Ticket void</p>
          <h2 className={styles.title}>This link no longer works.</h2>
          <p className={styles.successText}>
            It has expired or was already used. Sign in: if your email still needs confirming, you can send
            yourself a new link from there.
          </p>
          <SignInLink />
        </div>
      </Ticket>
    );
  }

  return (
    <Ticket>
      <div className={styles.success}>
        <p className={styles.kicker}>New member · Final check</p>
        <h2 className={styles.title}>Confirm your email</h2>
        <p className={styles.successText}>One press and your account is ready.</p>
        {formError && (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        )}
        <button type="button" className={styles.submit} onClick={handleConfirm} disabled={status === "pending"}>
          <span>{status === "pending" ? "Confirming…" : "Confirm my email"}</span>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </Ticket>
  );
}

function SignInLink() {
  return (
    <Link href="/signin" className={styles.submit}>
      <span>Sign in</span>
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
    </Link>
  );
}
