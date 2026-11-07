import { useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import styles from "./auth.module.css";

type FieldErrors = Partial<Record<string, string>>;

// Mirrors the password rule in server/src/modules/auth/auth.validation.ts; the server stays the source of truth.
export const MIN_PASSWORD = 12;

export function useFieldErrors() {
  const [errors, setErrors] = useState<FieldErrors>({});

  // Commit first so aria-describedby is in place when focus lands on the field.
  function showErrors(form: HTMLFormElement, next: FieldErrors) {
    flushSync(() => setErrors(next));
    form.querySelector<HTMLInputElement>("[aria-invalid=true]")?.focus();
  }

  function clearError(name: string) {
    if (errors[name]) setErrors(({ [name]: _, ...rest }) => rest);
  }

  return { errors, showErrors, clearError };
}

/** The browser's own constraint messages (required, type=email, minLength…), shown inline instead of as bubbles. */
export function nativeErrors(form: HTMLFormElement): FieldErrors {
  const errors: FieldErrors = {};
  for (const input of form.querySelectorAll("input")) {
    if (!input.validity.valid) errors[input.name] = input.validationMessage;
  }
  return errors;
}

/** First message per field from the API's 422 `errors.fieldErrors`. */
export function serverFieldErrors(fieldErrors: Record<string, string[] | undefined>): FieldErrors {
  return Object.fromEntries(Object.entries(fieldErrors).map(([name, messages]) => [name, messages?.[0]]));
}

export function Ticket({ children }: { children: ReactNode }) {
  return (
    <div className={styles.ticketWrap}>
      <div className={styles.ticket}>
        <div className={styles.body}>{children}</div>
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
  name: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  action?: ReactNode;
};

export function Field({ name, label, error, hint, action, ...input }: FieldProps) {
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

/** The hint under a new-password field: a meter that fills up to MIN_PASSWORD characters. */
export function PasswordLengthHint({ length }: { length: number }) {
  return (
    <>
      <span
        className={styles.meter}
        data-full={length >= MIN_PASSWORD || undefined}
        style={{ "--fill": Math.min(length / MIN_PASSWORD, 1) } as CSSProperties}
        aria-hidden="true"
      />
      {length === 0
        ? `At least ${MIN_PASSWORD} characters`
        : length < MIN_PASSWORD
          ? `${MIN_PASSWORD - length} more to go`
          : "Long enough"}
    </>
  );
}

export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={styles.toggle} onClick={onToggle}>
      {shown ? "Hide" : "Show"}
      <span className="sr-only"> password</span>
    </button>
  );
}
