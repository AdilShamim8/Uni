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
  title: "YOU — Open-source AI workspace",
  description:
    "Premium AI capabilities in an open-source workspace: bring your own keys, choose any model, chat with streaming persistence, and keep full control of your data.",
  keywords: ["YOU", "AI workspace", "open source", "BYOK", "AI chat", "agents", "Next.js"],
  authors: [{ name: "YOU contributors" }],
  openGraph: {
    title: "YOU — Open-source AI workspace",
    description: "Your keys, your models, your workspace. Open source under Apache-2.0.",
    siteName: "YOU",
    type: "website",
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
