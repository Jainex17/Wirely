import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const displayFont = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Resolves relative Open Graph and canonical URLs to the canonical domain.
  // The apex 308-redirects to www, and www is the host that serves content,
  // so resolved URLs must use www to avoid a redirect hop for every fetcher.
  metadataBase: new URL("https://www.wirely.site"),
  title: "Wirely",
  description: "The design canvas for your coding agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shouldRenderAnalytics = process.env.VERCEL === "1";

  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} antialiased`}
      >
        <ClerkProvider signInUrl={process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/login"}>
          {children}
          <Toaster />
          {shouldRenderAnalytics ? <Analytics /> : null}
        </ClerkProvider>
      </body>
    </html>
  );
}
