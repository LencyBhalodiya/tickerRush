"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { flushSync } from "react-dom";
import styles from "./signup.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
// Mirrors signUpSchema in server/src/modules/auth/auth.validation.ts; the server stays the source of truth.
const MIN_PASSWORD = 12;

const FIELDS = ["name", "email", "password"] as const;
type FieldName = (typeof FIELDS)[number];
type FieldErrors = Partial<Record<FieldName, string>>;

export function SignupForm() {
  const [pending, setPending] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLength, setPasswordLength] = useState(0);
  const successRef = useRef<HTMLHeadingElement>(null);

  // Commit the errors first so aria-describedby is in place when focus lands on the field.
  function showErrors(form: HTMLFormElement, next: FieldErrors) {
    flushSync(() => setErrors(next));
    const first = FIELDS.find((field) => next[field]);
    if (first) (form.elements.namedItem(first) as HTMLInputElement).focus();
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError("");

    // Native constraint validation, shown inline instead of browser bubbles.
    const invalid: FieldErrors = {};
    for (const input of form.querySelectorAll("input")) {
      if (!input.validity.valid) invalid[input.name as FieldName] = input.validationMessage;
    }
    showErrors(form, invalid);
    if (Object.keys(invalid).length > 0) return;

    const body = Object.fromEntries(new FormData(form)) as Record<FieldName, string>;
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        flushSync(() => setFirstName(body.name.trim().split(/\s+/)[0]));
        successRef.current?.focus();
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        showErrors(form, { email: data.message });
      } else if (res.status === 422 && data.errors?.fieldErrors) {
        const fieldErrors: Partial<Record<FieldName, string[]>> = data.errors.fieldErrors;
        showErrors(form, Object.fromEntries(FIELDS.map((field) => [field, fieldErrors[field]?.[0]])));
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
    const field = event.target.name as FieldName;
    if (field === "password") setPasswordLength(event.target.value.length);
    if (errors[field]) setErrors(({ [field]: _, ...rest }) => rest);
  }

  return (
    <div className={styles.ticketWrap}>
      <div className={styles.ticket}>
        <div className={styles.body}>
          {firstName !== null ? (
            <div className={styles.success}>
              <span className={styles.stamp} aria-hidden="true">
                Issued
              </span>
              <p className={styles.kicker}>Admit one · Confirmed</p>
              <h2 ref={successRef} tabIndex={-1} className={styles.title}>
                You&rsquo;re in, {firstName}.
              </h2>
              <p className={styles.successText}>
                Your TicketRush account is ready. Sign-in opens soon, so keep an eye on the box office.
              </p>
            </div>
          ) : (
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
                action={
                  <button type="button" className={styles.toggle} onClick={() => setShowPassword((shown) => !shown)}>
                    {showPassword ? "Hide" : "Show"}
                    <span className="sr-only"> password</span>
                  </button>
                }
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
            </form>
          )}
        </div>

        <div className={styles.stub} aria-hidden="true">
          <span className={styles.stubTitle}>Admit one</span>
          <span className={styles.barcode} />
          <span className={styles.serial}>Nº 000001</span>
        </div>
      </div>
    </div>
  );
}

type FieldProps = ComponentProps<"input"> & {
  name: FieldName;
  label: string;
  error?: string;
  hint?: ReactNode;
  action?: ReactNode;
};

function Field({ name, label, error, hint, action, ...input }: FieldProps) {
  const describedBy = [error && `${name}-error`, hint && `${name}-hint`].filter(Boolean).join(" ");
  return (
    <div className={styles.field} data-invalid={error ? true : undefined}>
      <label htmlFor={name}>{label}</label>
      <div className={styles.control}>
        <input id={name} name={name} aria-invalid={!!error} aria-describedby={describedBy || undefined} {...input} />
        {action}
      </div>
      {error && (
        <p id={`${name}-error`} className={styles.error}>
          {error}
        </p>
      )}
      {hint && (
        <p id={`${name}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
