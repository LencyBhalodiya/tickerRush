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
          <p className={styles.kicker}>Admit one · Check your inbox</p>
          <h2 ref={successRef} tabIndex={-1} className={styles.title}>
            Almost there, {firstName}.
          </h2>
          <p className={styles.successText}>
            We&rsquo;ve emailed you a link to confirm your address. Open it, then sign in to start holding seats.
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
          hint={<PasswordLengthHint length={passwordLength} />}
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
