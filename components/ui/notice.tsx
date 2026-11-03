import { cx } from "./cx";

/** A banner for things the reader should know about, such as storage not working. */
export function Notice({
  tone = "info",
  className,
  children,
}: {
  tone?: "info" | "warning";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      className={cx(
        "rounded-md border px-4 py-3 font-sans text-sm",
        tone === "warning" ? "border-danger bg-surface text-ink" : "border-rule bg-surface text-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}
