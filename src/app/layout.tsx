import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://re-woo-two.vercel.app"),
  title: "ReWoo — Open-source AI workspace",
  description:
    "Premium AI capabilities in an open-source workspace: bring your own keys, choose any model, chat with streaming persistence, and keep full control of your data.",
  keywords: ["ReWoo", "AI workspace", "open source", "BYOK", "AI chat", "agents", "Next.js"],
  authors: [{ name: "ReWoo contributors" }],
  icons: {
    icon: [
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "ReWoo — Open-source AI workspace",
    description: "Your keys, your models, your workspace. Open source under Apache-2.0.",
    siteName: "ReWoo",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ReWoo — the open-source AI workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ReWoo — Open-source AI workspace",
    description: "Your keys, your models, your workspace. Open source under Apache-2.0.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#16151a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
