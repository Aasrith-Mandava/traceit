import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import { NavTracker } from "@/components/BackLink";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraceIt",
  // The TraceIt symbol as a crisp SVG tab icon (app/favicon.ico stays as the fallback).
  icons: { icon: "/icon.svg" },
  description: "Every other app deletes your mistakes. We keep them.",
};

export const viewport: Viewport = {
  themeColor: "#f3f2fb",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

// Root layout of the app itself (/app, /session, /review, …). The marketing page (/welcome) has its
// own root layout and stylesheet in app/(marketing), so the two sites' CSS never meets.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col text-ink">
        {/* Remembers the pages this tab shows, so the toolbars' "Back" returns to the right one. */}
        <NavTracker />
        {children}
      </body>
    </html>
  );
}
