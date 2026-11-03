import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <div className="mx-auto flex max-w-[62rem] justify-center px-5 py-8 lg:py-12">
      <Suspense fallback={<Skeleton lines={8} className="w-full max-w-[25rem]" />}>
        <SignUp />
      </Suspense>
    </div>
  );
}
