"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { postJson } from "../../api";
import { useSession } from "../../session";
import styles from "../auth.module.css";
import { Field, nativeErrors, PasswordToggle, serverFieldErrors, Ticket, useFieldErrors } from "../ticket-form";

export function SignInForm() {
  const router = useRouter();
  const [, setSession] = useSession();
  const { errors, showErrors, clearError } = useFieldErrors();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError("");

    const invalid = nativeErrors(form);
    showErrors(form, invalid);
    if (Object.keys(invalid).length > 0) return;

    setPending(true);
    try {
      const { res, data } = await postJson("/auth/signin", Object.fromEntries(new FormData(form)));

      if (res.ok) {
        setSession(data);
        router.replace("/account");
        return; // Stay pending until the account page takes over.
      }

      if (res.status === 422 && data.errors?.fieldErrors) {
        showErrors(form, serverFieldErrors(data.errors.fieldErrors));
      } else {
        // 401 never says which field was wrong, so it goes in the banner; the password is ready to retype.
        setFormError(data.message ?? "Something went wrong. Please try again.");
        const password = form.elements.namedItem("password") as HTMLInputElement;
        password.focus();
        password.select();
      }
    } catch {
      setFormError("We can't reach the box office right now. Check your connection and try again.");
    }
    setPending(false);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    clearError(event.target.name);
  }

  return (
    <Ticket>
      <form className={styles.form} noValidate onSubmit={handleSubmit}>
        <header>
          <p className={styles.kicker}>Returning member · Will call</p>
          <h2 className={styles.title}>Sign in</h2>
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
          // "username" (not "email") is what password managers look for on a sign-in form.
          autoComplete="username"
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
          autoComplete="current-password"
          required
          maxLength={128}
          action={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword((shown) => !shown)} />}
        />

        <button type="submit" className={styles.submit} disabled={pending}>
          <span>{pending ? "Checking your ticket…" : "Take my seat"}</span>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
        </button>
        <p className={styles.fine}>
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </form>
    </Ticket>
  );
}
