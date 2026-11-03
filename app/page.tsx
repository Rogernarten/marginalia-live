import { LiveGate } from "@/components/live/live-room";

export default function Home() {
  return (
    <div className="mx-auto max-w-[62rem] px-5 py-8 lg:py-12">
      <p className="eyebrow">Wikipedia, live</p>
      <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">The world of Pride and Prejudice, edited now</h1>
      <p className="mt-3 max-w-[40rem] text-[1.0625rem] leading-relaxed text-muted">
        People edit Wikipedia&apos;s pages on the novel&apos;s places, history and people every few minutes. Follow the topics you
        care about and watch the edits arrive.
      </p>
      <LiveGate />
    </div>
  );
}
