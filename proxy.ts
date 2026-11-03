import { clerkMiddleware } from "@clerk/nextjs/server";

// Reads the Clerk session on every request so pages and route handlers can call auth().
// It doesn't decide who may see what: each private page calls auth.protect() itself.
export default clerkMiddleware({ signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
