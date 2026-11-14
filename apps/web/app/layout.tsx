import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://affinity.jonzhang.dev"),
  title: "Affinity — Recommendation intelligence",
  description:
    "Inspect user representations, compare recommenders, and understand every ranked result.",
  alternates: { canonical: "/" },
  icons: {
    icon: "/affinity-mark.svg",
    shortcut: "/affinity-mark.svg",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Affinity",
    title: "Affinity — Recommendation intelligence",
    description:
      "A production recommendation platform for behavioral learning, model operations, and explained ranking.",
    images: [{ url: "/affinity-logo.svg", alt: "Affinity" }],
  },
  twitter: {
    card: "summary",
    title: "Affinity — Recommendation intelligence",
    description:
      "Behavioral learning, model operations, and explained ranking in one production platform.",
    images: ["/affinity-logo.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
