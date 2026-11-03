import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Libre_Caslon_Text } from "next/font/google";
import { Suspense } from "react";
import { SiteNav, SiteNavShell } from "@/components/ui/site-nav";
import "./globals.css";

const ui = Geist({
  variable: "--font-ui",
  subsets: ["latin"],
});

const book = Libre_Caslon_Text({
  variable: "--font-book",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "Marginalia Live · The world of Pride and Prejudice, edited live",
    template: "%s · Marginalia Live",
  },
  description:
    "Follow topics from Pride and Prejudice, from Jane Austen to the Napoleonic Wars, and watch Wikipedia edits to them arrive as they happen.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${ui.variable} ${book.variable} antialiased`}>
      <body className="min-h-dvh bg-paper font-sans text-ink">
        <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
          <a
            href="#main"
            className="sr-only rounded-md bg-ink px-4 py-2 text-surface focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
          >
            Skip to content
          </a>
          <Suspense fallback={<SiteNavShell />}>
            <SiteNav />
          </Suspense>
          <main id="main" tabIndex={-1} className="outline-none">
            {children}
          </main>
        </ClerkProvider>
      </body>
    </html>
  );
}
