"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent, type SubmitEvent } from "react";
import { flushSync } from "react-dom";
import { postJson } from "../../api";
import styles from "../auth.module.css";
import {
  Field,
  MIN_PASSWORD,
  nativeErrors,
  PasswordLengthHint,
  PasswordToggle,
  serverFieldErrors,
  Ticket,
  useFieldErrors,
} from "../ticket-form";

type Status = "ready" | "done" | "invalid";

export function ResetPasswordForm({ token }: { token?: string }) {
  const { errors, showErrors, clearError } = useFieldErrors();
  const [status, setStatus] = useState<Status>(token ? "ready" : "invalid");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLength, setPasswordLength] = useState(0);
  const doneRef = useRef<HTMLHeadingElement>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError("");

    const invalid = nativeErrors(form);
    showErrors(form, invalid);
    if (Object.keys(invalid).length > 0) return;

    setPending(true);
    try {
      const { password } = Object.fromEntries(new FormData(form));
      const { res, data } = await postJson("/auth/reset-password", { token, password });

      if (res.ok) {
        flushSync(() => setStatus("done"));
        doneRef.current?.focus();
        return;
      }
      if (data.code === "INVALID_RESET_TOKEN") {
        setStatus("invalid");
        return;
      }

      if (res.status === 422 && data.errors?.fieldErrors) {
        const fieldErrors = serverFieldErrors(data.errors.fieldErrors);
        // A token error means a mangled link, not something the user can fix in the form.
        if (fieldErrors.token) setStatus("invalid");
        else showErrors(form, fieldErrors);
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
    setPasswordLength(event.target.value.length);
    clearError(event.target.name);
  }

  if (status === "done") {
    return (
      <Ticket>
        <div className={styles.success}>
          <span className={styles.stamp} aria-hidden="true">
            Reissued
          </span>
          <p className={styles.kicker}>Admit one · New password</p>
          <h2 ref={doneRef} tabIndex={-1} className={styles.title}>
            Password changed.
          </h2>
          <p className={styles.successText}>
            You&rsquo;ve been signed out on every device. Sign in with your new password.
          </p>
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

  if (status === "invalid") {
    return (
      <Ticket>
        <div className={styles.success}>
          <p className={styles.kicker}>Ticket void</p>
          <h2 className={styles.title}>This link no longer works.</h2>
          <p className={styles.successText}>Reset links work once and expire after 1 hour. Ask for a new one.</p>
          <Link href="/forgot-password" className={styles.submit}>
            <span>Send a new link</span>
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
          <p className={styles.kicker}>Returning member · New password</p>
          <h2 className={styles.title}>Choose a new password</h2>
        </header>

        {formError && (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        )}

        <Field
          label="New password"
          name="password"
          type={showPassword ? "text" : "password"}
          error={errors.password}
          onChange={handleChange}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          maxLength={128}
          action={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword((shown) => !shown)} />}
          hint={<PasswordLengthHint length={passwordLength} />}
        />

        <button type="submit" className={styles.submit} disabled={pending}>
          <span>{pending ? "Saving…" : "Save new password"}</span>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
        </button>
        <p className={styles.fine}>Saving signs you out on every device.</p>
      </form>
    </Ticket>
  );
}
