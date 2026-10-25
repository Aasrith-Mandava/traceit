// The four "Highlighter" typefaces, shared by both root layouts and the global 404 so each is
// declared once. next/font downloads them at build time and self-hosts them (no runtime requests).
import { Bricolage_Grotesque, Caveat, Figtree, JetBrains_Mono } from "next/font/google";

/**
 * Display: headings, the wordmark, big numbers. The variable font with its optical-size axis, so big
 * headlines get the tighter display cut (static weights would stay at the text size and run wide).
 */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  axes: ["opsz"],
  subsets: ["latin"],
});

/** Body and UI text. */
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

/** Clocks, counts and metadata. */
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", weight: ["400", "500"], subsets: ["latin"] });

/** Handwriting: margin notes and sample notebook pages. */
const caveat = Caveat({ variable: "--font-caveat", weight: ["500", "600", "700"], subsets: ["latin"] });

/** Put on <html> so the CSS variables the stylesheets' @theme reads are defined. */
export const fontVariables = [bricolage, figtree, jetbrainsMono, caveat].map((f) => f.variable).join(" ");
