import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Traffic Jam Phase Lab",
  description: "Interactive Optimal Velocity model simulator based on Bando et al. 1995.",
  openGraph: {
    title: "Traffic Jam Phase Lab",
    description: "Explore spontaneous traffic congestion on a circular road with the Optimal Velocity model.",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
