"use client";

import { Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx, FOCUS } from "./cx";

/** The book itself lives in Marginalia (Assignment 4). */
const MARGINALIA = "https://marginalia-fullstack-eight.vercel.app";

function NavLink({ href, current, children }: { href: string; current?: "page"; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current}
      className={cx(
        "flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[0.9375rem] underline-offset-[0.6rem] hover:underline hover:decoration-edge sm:px-3",
        current && "font-semibold underline decoration-accent decoration-2 hover:decoration-accent",
        FOCUS,
      )}
    >
      {children}
    </Link>
  );
}

/** Shared top navigation. */
export function SiteNav() {
  const path = usePathname();

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-[62rem] items-center justify-between gap-2 px-4 py-2 sm:gap-4 sm:px-5">
        <Link href="/" aria-current={path === "/" ? "page" : undefined} className={cx("rounded-md py-2 font-serif text-xl", FOCUS)}>
          <span className="italic">Marginalia</span> Live
        </Link>
        <nav aria-label="Main">
          <ul className="flex items-center sm:gap-1">
            <li>
              <NavLink href={MARGINALIA}>Read the book</NavLink>
            </li>
            <li className="flex min-w-11 justify-end">
              <Show when="signed-out">
                <NavLink href="/sign-in" current={path.startsWith("/sign-in") ? "page" : undefined}>
                  Sign in
                </NavLink>
              </Show>
              <Show when="signed-in">
                {/* Avatar menu: manage account and sign out. */}
                <div className="flex min-h-11 items-center px-2 sm:px-3">
                  <UserButton />
                </div>
              </Show>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

/** Same height as the nav, for pages whose URL isn't known until the request (sign-in). */
export function SiteNavShell() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto min-h-[3.75rem] max-w-[62rem] px-4 py-2 sm:px-5" />
    </header>
  );
}
