import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { CANONICAL_APP_ORIGIN } from "@/lib/appUrl";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/site";

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
  // Resolves relative canonical URLs to the canonical domain. www is the host
  // the sitemap and all canonicals name, so both hosts must answer with the
  // same instruction: the canonical tag tells crawlers which copy counts even
  // while the apex still serves 200. The Vercel domain config should also 308
  // the apex to www so fetchers never see two live copies in the first place.
  metadataBase: new URL(CANONICAL_APP_ORIGIN),
  alternates: { canonical: "/" },
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Link previews in chat apps and social posts. The image comes from
  // app/opengraph-image.tsx, which Next attaches on its own. Title and
  // description stay out of these objects on purpose: Next fills them from
  // each page's own title and description, so /docs previews as /docs. Set
  // them here and every child page would preview as the home page.
  openGraph: { type: "website", siteName: SITE_NAME },
  twitter: { card: "summary_large_image" },
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
