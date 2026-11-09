"use client";

import Link from "next/link";
import { SignIn, SignUp } from "@clerk/nextjs";
import WirelyMark from "@/components/icons/WirelyMark";

// Clerk's own card is flattened so this page's card frames it, and its colors
// read from the app's tokens. The headings come from the localization on
// ClerkProvider, so every step (password, email code, reset) keeps its own.
const APPEARANCE = {
  options: {
    elevation: "flush",
    socialButtonsVariant: "blockButton",
    socialButtonsPlacement: "top",
  },
  variables: {
    colorPrimary: "var(--foreground)",
    colorPrimaryForeground: "var(--background)",
    colorBackground: "var(--card)",
    colorForeground: "var(--foreground)",
    colorMutedForeground: "var(--muted-foreground)",
    colorInput: "var(--background)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorDanger: "var(--destructive)",
    borderRadius: "0.625rem",
    fontSize: "0.9375rem",
  },
  elements: {
    // Clerk's card keeps a fixed width and a shadow of its own; both give way
    // to the frame here.
    rootBox: "w-full!",
    cardBox: "w-full! max-w-none! shadow-none! border-0! rounded-none!",
    card: "w-full! max-w-none! p-0! shadow-none! bg-transparent!",
    logoBox: "hidden!",
    header: "items-start! text-left! gap-2!",
    headerTitle: "font-display text-[1.75rem]! font-semibold! tracking-[-0.02em]!",
    headerSubtitle: "text-[15px]! leading-relaxed! text-left!",
    socialButtonsBlockButton: "h-11!",
    formButtonPrimary: "h-11! text-[15px]! font-medium! shadow-none!",
    // The app's border token nearly matches the card, so the divider and the
    // field edges take a lighter line here.
    dividerLine: "bg-foreground/15!",
    formFieldInput: "h-11! shadow-[0_0_0_1px_rgb(233_236_245_/_0.14)]!",
    footer: "bg-transparent! px-0!",
  },
} as const;

/**
 * The sign-in and sign-up card: the Wirely mark over Clerk's prebuilt form,
 * which carries Google and, once enabled in the Clerk dashboard, email with
 * password, plus verification and password reset. Hash routing keeps every
 * step on one path, including the OAuth callback.
 */
export default function AuthCard({ mode, nextPath }: { mode: "sign-in" | "sign-up"; nextPath: string }) {
  return (
    // The settings modal looks for this, see app/@modal/(.)setting/SettingsModalFrame.tsx.
    <main
      data-wirely-auth-page
      className="flex min-h-[100dvh] items-center justify-center bg-background px-6 py-12 text-foreground"
    >
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card p-8">
        <Link href="/" className="mb-7 inline-flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight">
          <WirelyMark className="size-7" />
          Wirely
        </Link>
        {mode === "sign-in" ? (
          <SignIn
            routing="hash"
            signUpUrl="/sign-up"
            forceRedirectUrl={nextPath}
            signUpForceRedirectUrl={nextPath}
            appearance={APPEARANCE}
          />
        ) : (
          <SignUp
            routing="hash"
            signInUrl="/login"
            forceRedirectUrl={nextPath}
            signInForceRedirectUrl={nextPath}
            appearance={APPEARANCE}
          />
        )}
      </div>
    </main>
  );
}
