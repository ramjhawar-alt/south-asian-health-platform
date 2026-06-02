import type { Metadata } from "next";
import { Anek_Devanagari, DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { ConditionalChrome } from "@/components/conditional-chrome";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  preload: true,
});

/** Latin + Devanagari; distinctive Indian UI tone for the home hero title */
const anekDevanagari = Anek_Devanagari({
  variable: "--font-anek-devanagari",
  subsets: ["latin", "devanagari"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "South Asian Health",
  description:
    "Health information and tools grounded in research on South Asian populations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fraunces.variable} ${anekDevanagari.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)] font-sans">
        <ConditionalChrome>{children}</ConditionalChrome>
      </body>
    </html>
  );
}
