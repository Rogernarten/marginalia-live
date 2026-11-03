import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[38rem] px-5 py-16">
      <h1 className="font-serif text-3xl">We can&apos;t find that page.</h1>
      <p className="mt-3 text-[1.0625rem] text-muted">It may have moved, or the link has a typo.</p>
      <LinkButton href="/" className="mt-6">
        Go to the start
      </LinkButton>
    </div>
  );
}
