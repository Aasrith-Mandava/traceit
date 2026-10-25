import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

/**
 * Absolute base for og:image and friends. Set NEXT_PUBLIC_SITE_URL for a custom domain; on Vercel
 * the production URL is used automatically, on Railway its generated domain (RAILWAY_PUBLIC_DOMAIN);
 * locally it falls back to the dev server.
 */
function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return new URL(`https://${vercel}`);
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return new URL(`https://${railway}`);
  return new URL(`http://localhost:${process.env.PORT || 3000}`);
}

const title = "TraceIt — Study notes that learn from your mistakes";
const description =
  "Your eraser is hiding the good stuff. TraceIt quietly watches how you write during a lecture — the pauses, the scratch-outs, the do-overs — and turns them into a trail of what you fixed, what still feels fuzzy, and the exact second of lecture behind each one.";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title,
  description,
  applicationName: "TraceIt",
  keywords: ["note-taking", "handwriting", "lecture notes", "iPad", "Apple Pencil", "learning analytics", "Notability", "study tools"],
  alternates: { canonical: "/welcome" },
  openGraph: {
    type: "website",
    siteName: "TraceIt",
    title,
    description,
    url: "/welcome",
    images: [
      {
        url: "/traceit-demo-poster.jpg",
        width: 1280,
        height: 720,
        alt: "TraceIt's study screen: an erased answer kept as a faded ghost under the rewrite, marked on the learning trail as a mistake you fixed.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/traceit-demo-poster.jpg"],
  },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#f3f2fb",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "TraceIt",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web (designed for iPad and Apple Pencil)",
  description,
};

// Root layout of the marketing page (/welcome): its own stylesheet and the shared Highlighter fonts
// (lib/fonts) on a flat lavender desk. The app (/app, /session, …) has a separate root layout in
// app/(product).
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fontVariables} antialiased`}
    >
      <body className="min-h-dvh text-ink">
        {children}
        <script
          type="application/ld+json"
          // Static, build-time JSON (no user input).
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      </body>
    </html>
  );
}
