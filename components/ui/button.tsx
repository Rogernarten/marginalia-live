import Link from "next/link";
import { cx, FOCUS } from "./cx";

type Variant = "primary" | "secondary" | "quiet";

const BASE = cx(
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-4 font-sans text-[0.9375rem] font-medium whitespace-nowrap transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:translate-y-0",
  FOCUS,
);

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong disabled:bg-rule disabled:text-muted",
  secondary: "border border-edge bg-surface text-ink hover:bg-paper disabled:text-muted",
  quiet: "px-2 text-ink underline decoration-edge underline-offset-4 hover:decoration-ink",
};

export function buttonClass(variant: Variant = "primary", className?: string) {
  return cx(BASE, VARIANTS[variant], className);
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

/** An inline text link, for use inside sentences. */
export function TextLink({ className, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cx(
        "rounded-sm text-ink underline decoration-edge underline-offset-4 hover:decoration-ink",
        FOCUS,
        className,
      )}
      {...props}
    />
  );
}

/** A link to another site, opened in a new tab so the reader keeps their place. */
export function ExternalLink({ className, children, ...props }: React.ComponentProps<"a">) {
  return (
    <a
      target="_blank"
      rel="noreferrer"
      className={cx(
        "rounded-sm text-ink underline decoration-edge underline-offset-4 hover:decoration-ink",
        FOCUS,
        className,
      )}
      {...props}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
