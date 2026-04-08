import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Wirely",
  description: "Wirely website builder",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
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
