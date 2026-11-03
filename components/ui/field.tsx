import { cx, FOCUS } from "./cx";

// One column of label → hint → control → error. Errors sit right under their control, are
// linked with aria-describedby, and should say what to do next.

type Shell = {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  /** Shown under the control, right-aligned (e.g. a character count). */
  aside?: React.ReactNode;
};

const CONTROL = cx(
  "w-full rounded-md border border-edge bg-surface px-3 font-sans text-base text-ink placeholder:text-muted",
  "aria-invalid:border-2 aria-invalid:border-danger",
  FOCUS,
);

function describedBy(id: string, hint?: React.ReactNode, error?: React.ReactNode) {
  return [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
}

function FieldShell({ id, label, hint, error, optional, aside, children }: Shell & { children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block font-sans text-[0.9375rem] font-semibold">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 font-sans text-sm text-muted">
          {hint}
        </p>
      )}
      <div className="mt-2">{children}</div>
      {(error || aside) && (
        <div className="mt-2 flex items-start justify-between gap-4 font-sans text-sm">
          {error ? (
            <p id={`${id}-error`} className="flex gap-2 font-medium text-danger">
              <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0">
                <circle cx="8" cy="8" r="8" fill="currentColor" />
                <path d="M8 4.2v4.6M8 11.2v.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span>{error}</span>
            </p>
          ) : (
            <span />
          )}
          {aside}
        </div>
      )}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  error,
  optional,
  aside,
  className,
  ...input
}: Shell & Omit<React.ComponentProps<"input">, "id">) {
  return (
    <FieldShell {...{ id, label, hint, error, optional, aside }}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, "h-11", className)}
        {...input}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  optional,
  aside,
  className,
  ...textarea
}: Shell & Omit<React.ComponentProps<"textarea">, "id">) {
  return (
    <FieldShell {...{ id, label, hint, error, optional, aside }}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, "min-h-28 py-2.5 leading-relaxed", className)}
        {...textarea}
      />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  optional,
  aside,
  className,
  children,
  ...select
}: Shell & Omit<React.ComponentProps<"select">, "id">) {
  return (
    <FieldShell {...{ id, label, hint, error, optional, aside }}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, "h-11 cursor-pointer", className)}
        {...select}
      >
        {children}
      </select>
    </FieldShell>
  );
}
