"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent, type CSSProperties, type SubmitEvent } from "react";
import { flushSync } from "react-dom";
import { postJson } from "../../api";
import styles from "../auth.module.css";
import { Field, nativeErrors, PasswordToggle, serverFieldErrors, Ticket, useFieldErrors } from "../ticket-form";

// Mirrors signUpSchema in server/src/modules/auth/auth.validation.ts; the server stays the source of truth.
const MIN_PASSWORD = 12;

export function SignupForm() {
  const { errors, showErrors, clearError } = useFieldErrors();
  const [pending, setPending] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLength, setPasswordLength] = useState(0);
  const successRef = useRef<HTMLHeadingElement>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError("");

    const invalid = nativeErrors(form);
    showErrors(form, invalid);
    if (Object.keys(invalid).length > 0) return;

    const body = Object.fromEntries(new FormData(form)) as Record<"name" | "email" | "password", string>;
    setPending(true);
    try {
      const { res, data } = await postJson("/auth/signup", body);

      if (res.ok) {
        flushSync(() => setFirstName(body.name.trim().split(/\s+/)[0]));
        successRef.current?.focus();
        return;
      }

      if (res.status === 409) {
        showErrors(form, { email: data.message });
      } else if (res.status === 422 && data.errors?.fieldErrors) {
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
    if (event.target.name === "password") setPasswordLength(event.target.value.length);
    clearError(event.target.name);
  }

  if (firstName !== null) {
    return (
      <Ticket>
        <div className={styles.success}>
          <span className={styles.stamp} aria-hidden="true">
            Issued
          </span>
          <p className={styles.kicker}>Admit one · Confirmed</p>
          <h2 ref={successRef} tabIndex={-1} className={styles.title}>
            You&rsquo;re in, {firstName}.
          </h2>
          <p className={styles.successText}>Your TicketRush account is ready. Sign in to start holding seats.</p>
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

  return (
    <Ticket>
      <form className={styles.form} noValidate onSubmit={handleSubmit}>
        <header>
          <p className={styles.kicker}>New member · General admission</p>
          <h2 className={styles.title}>Create your account</h2>
        </header>

        {formError && (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        )}

        <Field
          label="Full name"
          name="name"
          error={errors.name}
          onChange={handleChange}
          autoComplete="name"
          placeholder="Ada Lovelace"
          required
          maxLength={100}
        />
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
        <Field
          label="Password"
          name="password"
          type={showPassword ? "text" : "password"}
          error={errors.password}
          onChange={handleChange}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          maxLength={128}
          action={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword((shown) => !shown)} />}
          hint={
            <>
              <span
                className={styles.meter}
                data-full={passwordLength >= MIN_PASSWORD || undefined}
                style={{ "--fill": Math.min(passwordLength / MIN_PASSWORD, 1) } as CSSProperties}
                aria-hidden="true"
              />
              {passwordLength === 0
                ? `At least ${MIN_PASSWORD} characters`
                : passwordLength < MIN_PASSWORD
                  ? `${MIN_PASSWORD - passwordLength} more to go`
                  : "Long enough"}
            </>
          }
        />

        <button type="submit" className={styles.submit} disabled={pending}>
          <span>{pending ? "Issuing your ticket…" : "Claim my ticket"}</span>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
        </button>
        <p className={styles.fine}>Passwords are hashed with argon2id.</p>
        <p className={styles.fine}>
          Already a member? <Link href="/signin">Sign in</Link>
        </p>
      </form>
    </Ticket>
  );
}
