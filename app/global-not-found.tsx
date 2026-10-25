// 404 for URLs that match no route at all. The site has two root layouts (app/(marketing) and
// app/(product)), so this page brings its own document, fonts and the app's stylesheet.
import type { Metadata, Viewport } from "next";
import { NotFoundScreen } from "@/components/StatusScreen";
import { fontVariables } from "@/lib/fonts";
import "./(product)/globals.css";

export const metadata: Metadata = { title: "Not found · TraceIt" };
export const viewport: Viewport = { themeColor: "#f3f2fb", colorScheme: "light" };

export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col text-ink">
        <NotFoundScreen />
      </body>
    </html>
  );
}
