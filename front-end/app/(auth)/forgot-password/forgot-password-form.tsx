"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent, type SubmitEvent } from "react";
import { flushSync } from "react-dom";
import { postJson } from "../../api";
import styles from "../auth.module.css";
import { Field, nativeErrors, serverFieldErrors, Ticket, useFieldErrors } from "../ticket-form";

export function ForgotPasswordForm() {
  const { errors, showErrors, clearError } = useFieldErrors();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");
  const [sent, setSent] = useState(false);
  const sentRef = useRef<HTMLHeadingElement>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError("");

    const invalid = nativeErrors(form);
    showErrors(form, invalid);
    if (Object.keys(invalid).length > 0) return;

    setPending(true);
    try {
      const { res, data } = await postJson("/auth/forgot-password", Object.fromEntries(new FormData(form)));

      if (res.ok) {
        flushSync(() => setSent(true));
        sentRef.current?.focus();
        return;
      }

      if (res.status === 422 && data.errors?.fieldErrors) {
        showErrors(form, serverFieldErrors(data.errors.fieldErrors));
      } else {
        setFormError(data.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("We can't reach the box office right now. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    clearError(event.target.name);
  }

  // The server answers the same for every email, so this screen can't say whether one was sent.
  if (sent) {
    return (
      <Ticket>
        <div className={styles.success}>
          <p className={styles.kicker}>Will call · Check your inbox</p>
          <h2 ref={sentRef} tabIndex={-1} className={styles.title}>
            Check your inbox.
          </h2>
          <p className={styles.successText}>
            If that email has an account, we&rsquo;ve sent it a link to choose a new password. The link works once,
            for 1 hour.
          </p>
          <Link href="/signin" className={styles.submit}>
            <span>Back to sign in</span>
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </Ticket>
    );
  }

  return (
    <Ticket>
      <form className={styles.form} noValidate onSubmit={handleSubmit}>
        <header>
          <p className={styles.kicker}>Returning member · Lost ticket</p>
          <h2 className={styles.title}>Reset your password</h2>
        </header>

        {formError && (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        )}

        <Field
          label="Email"
          name="email"
          type="email"
          error={errors.email}
          onChange={handleChange}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="ada@example.com"
          required
          maxLength={254}
        />

        <button type="submit" className={styles.submit} disabled={pending}>
          <span>{pending ? "Sending…" : "Send me a reset link"}</span>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
        </button>
        <p className={styles.fine}>
          Remembered it? <Link href="/signin">Sign in</Link>
        </p>
      </form>
    </Ticket>
  );
}
