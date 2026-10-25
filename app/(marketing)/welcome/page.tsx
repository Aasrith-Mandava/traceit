import type { ComponentType, ReactNode, SVGProps } from "react";
import { AskLauncher } from "@/components/landing/assistant/AskLauncher";
import { DemoVideo } from "@/components/landing/DemoVideo";
import { Faq } from "@/components/landing/Faq";
import { Highlight } from "@/components/motion/Highlight";
import { Features } from "@/components/landing/Features";
import { Hero, SiteHeader } from "@/components/landing/Hero";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/Reveal";
import { StoryTimeline } from "@/components/landing/StoryTimeline";
import { TryIt } from "@/components/landing/TryIt";
import { APP_URL, GITHUB_URL, appPath, demoUrl } from "@/components/landing/site";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  HardDriveIcon,
  TraceItMark,
  KeyIcon,
  ShieldIcon,
  StudentIcon,
  WifiOffIcon,
} from "@/components/landing/icons";
import { DEMO_LECTURE } from "@/lib/demo";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/** "The idea": the three-step version (the band); StoryTimeline below it is the long version. */
const IDEA_STEPS: { n: string; title: string; body: string; numberClass: string }[] = [
  {
    n: "01",
    title: "Write along",
    body: "Play a recorded lecture or capture a live one, and take notes with a stylus like you always do.",
    numberClass: "text-accent-light",
  },
  {
    n: "02",
    title: "TraceIt reads the signals",
    body: "Long pauses, bursts of erasing and quick rewrites are each matched to what the lecturer was saying at that second.",
    numberClass: "text-accent-light",
  },
  {
    n: "03",
    title: "Study what matters",
    body: "Get a trail of fixes, fuzzy spots and aha moments, each with a replay, a plain-English explanation and a quick self-test.",
    numberClass: "text-highlight",
  },
];

const STUDENT_POINTS = [
  "Help shows up at the exact second you slowed down, not at the end of the unit",
  "Your own pace is the baseline, so learning differences aren’t flagged as problems",
  "Studying in a second language? Explanations come in yours, read aloud if you like",
  "Anything still fuzzy follows you into the next session until it’s cleared",
];

const EDUCATOR_POINTS = [
  "The minutes where the class slowed down or started erasing, in 30-second slices",
  "The three stretches most worth teaching again, with what you were saying at the time",
  "Anonymous totals only: no names, no handwriting, never fewer than three students",
];

/**
 * The sample class heatmap: 2 rows × 12 thirty-second slices of a six-minute lecture. Darker =
 * more of the room slowed down or erased there; the lightest cells are slices too few students
 * share to show. Literal classes, one per cell.
 */
const HEATMAP_CELLS = [
  "bg-desk", "bg-desk", "bg-desk", "bg-accent", "bg-desk", "bg-desk", "bg-desk", "bg-desk", "bg-ink", "bg-desk", "bg-desk", "bg-accent-light",
  "bg-[#dad6f7]", "bg-accent-soft", "bg-desk", "bg-accent", "bg-desk", "bg-desk", "bg-desk", "bg-desk", "bg-ink", "bg-accent-soft", "bg-[#dad6f7]", "bg-[#a59cf7]",
];

const PRIVACY: { title: string; body: string; icon: Icon }[] = [
  {
    title: "Local-first by default",
    body: "Sessions live in a SQLite file on the machine running TraceIt, or in a Postgres database you choose, such as Tiger Data.",
    icon: HardDriveIcon,
  },
  {
    title: "Anonymous class insights",
    body: "Teachers see patterns, never people: no names, ids or handwriting, and nothing shared by fewer than three students.",
    icon: ShieldIcon,
  },
  {
    title: "Only what a moment needs",
    body: "AI help receives the lecture excerpt and the before and after of one revision. Provider keys stay on the server and are never logged.",
    icon: KeyIcon,
  },
  {
    title: "Works fully offline",
    body: "Demo mode runs from saved, hand-checked answers with no network at all — handy in a classroom with patchy Wi-Fi.",
    icon: WifiOffIcon,
  },
];

function SectionHeader({
  id,
  kicker,
  title,
  lead,
  center = false,
}: {
  id: string;
  kicker: string;
  title: ReactNode;
  lead?: string;
  center?: boolean;
}) {
  return (
    <Reveal className={center ? "mx-auto flex max-w-3xl flex-col items-center gap-3.5 text-center" : "flex max-w-3xl flex-col gap-3.5"}>
      <p className="kicker">{kicker}</p>
      <h2 id={id} className="section-title text-ink">
        {title}
      </h2>
      {lead && <p className="max-w-2xl text-[18px] leading-[1.6] text-pretty text-ink-muted">{lead}</p>}
    </Reveal>
  );
}

function Points({ items, dot }: { items: string[]; dot: string }) {
  return (
    <ul className="grid gap-2.5">
      {items.map((p) => (
        <li key={p} className="flex gap-3 text-[16px] leading-[1.55] text-pretty text-ink-muted">
          <span aria-hidden="true" className={`mt-[0.5em] size-2 shrink-0 rounded-full ${dot}`} />
          {p}
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-[70] rounded-pill bg-ink px-4 py-3 font-bold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main">
        <Hero />

        {/* ───────────── The idea (dark band) + the step-by-step story ───────────── */}
        <section id="how" aria-labelledby="how-title">
          <div className="on-dark bg-night text-white">
            <div className="container-x flex flex-col gap-11 py-20">
              <Reveal className="flex max-w-[760px] flex-col gap-3.5">
                <p className="kicker text-highlight">The idea</p>
                <h2 id="how-title" className="section-title">
                  Most note apps save the final page. The learning happened{" "}
                  <span className="font-hand text-[1.15em] font-bold tracking-normal text-highlight">before</span> that.
                </h2>
                <p className="text-[18px] leading-[1.6] text-pretty text-night-text">
                  A crossed-out line is a clue: it marks the moment something confused you, and often the moment it
                  started making sense. TraceIt keeps those clues instead of throwing them away.
                </p>
              </Reveal>
              <Stagger as="ol" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-[18px]">
                {IDEA_STEPS.map((s) => (
                  <StaggerItem
                    key={s.n}
                    as="li"
                    className="flex flex-col gap-3 rounded-lg border border-night-line bg-[#221e3d] p-6"
                  >
                    <span aria-hidden="true" className={`font-display text-[44px] leading-none font-extrabold ${s.numberClass}`}>
                      {s.n}
                    </span>
                    <h3 className="font-sans text-[20px] font-bold tracking-normal">{s.title}</h3>
                    <p className="text-[16px] leading-[1.55] text-night-text">{s.body}</p>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </div>

          <div className="container-x section-y">
            <Reveal className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="flex max-w-2xl flex-col gap-3">
                <p className="kicker">How it works</p>
                <h3 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.05] font-extrabold tracking-[-0.035em] text-balance text-ink">
                  One lecture, step by step.
                </h3>
                <p className="text-[17px] leading-relaxed text-pretty text-ink-muted">
                  Four steps, running quietly while you take notes the way you already do. Tap one for a closer look.
                </p>
              </div>
            </Reveal>
            <div className="mt-6">
              <StoryTimeline demoHref={demoUrl()} />
            </div>
          </div>
        </section>

        {/* ───────────── Demo video ───────────── */}
        <section id="demo" aria-labelledby="demo-title">
          <div className="container-x section-y pt-0 sm:pt-0">
            <SectionHeader
              id="demo-title"
              kicker="See it in action · 2:59"
              title={
                <>
                  Three minutes, one slip, <Highlight>caught</Highlight>.
                </>
              }
              lead="A student takes notes on a chain-rule lecture, gets one step wrong, fixes it — and TraceIt shows everything the final page would have hidden."
              center
            />
            <Reveal className="mx-auto mt-10 max-w-[1000px]">
              <div className="rounded-[28px] border border-line bg-white p-1.5 shadow-page sm:p-2">
                <div className="overflow-hidden rounded-[22px]">
                  <DemoVideo />
                </div>
              </div>
              {/* CC BY-NC-SA requires crediting the lecture footage next to the video. */}
              <p className="mt-3 text-center text-[13px] text-ink-subtle">
                Lecture clip:{" "}
                <a
                  href="https://ocw.mit.edu/courses/18-01-single-variable-calculus-fall-2006/"
                  className="font-semibold underline decoration-ink/25 underline-offset-4 hover:text-ink"
                  rel="noopener"
                >
                  MIT OpenCourseWare 18.01
                </a>
                , CC BY-NC-SA
              </p>
            </Reveal>
          </div>
        </section>

        {/* ───────────── Try it ───────────── */}
        <section id="try" aria-labelledby="try-title">
          <div className="container-x section-y pt-0 sm:pt-0">
            <SectionHeader
              id="try-title"
              kicker="Try it right here"
              title={
                <>
                  Make a mistake. <Highlight>Watch it stay.</Highlight>
                </>
              }
              lead="Write, rub part of it out, then write it again in the same spot. It’s the whole idea behind TraceIt, running right here in your browser."
            />
            <Reveal className="mt-10">
              <TryIt />
            </Reveal>
          </div>
        </section>

        {/* ───────────── What's inside ───────────── */}
        <section id="features" aria-labelledby="features-title">
          <div className="container-x section-y flex flex-col gap-9 pt-0 sm:pt-0">
            <Reveal className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="features-title" className="section-title max-w-[640px] text-ink">
                Everything your notebook should have been doing <Highlight>all along</Highlight>.
              </h2>
              <p className="hand-note -rotate-3 text-[28px]">six tools, zero extra effort</p>
            </Reveal>
            <Features labHref={appPath("/insights/evaluation")} />
          </div>
        </section>

        {/* ───────────── Educators + students ───────────── */}
        <section id="audiences" aria-labelledby="audiences-title">
          <h2 id="audiences-title" className="sr-only">
            Who it’s for
          </h2>
          <div className="container-x section-y grid gap-[18px] pt-0 sm:pt-0">
            <Reveal className="flex flex-wrap items-center gap-10 rounded-[32px] border border-line bg-white p-[clamp(24px,4vw,48px)] shadow-hairline">
              <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-3.5">
                <p className="kicker text-gap-strong">For educators</p>
                <h3 className="font-display text-[clamp(30px,3.6vw,44px)] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance text-ink">
                  Find the minute your class lost the thread.
                </h3>
                <p className="text-[17px] leading-[1.6] text-pretty text-ink-muted">
                  TraceIt pools writing patterns from the whole room into 30-second slices and surfaces the three moments
                  most worth teaching again. It never uses names or cameras, and any group under three students is left
                  out.
                </p>
                <Points items={EDUCATOR_POINTS} dot="bg-gap" />
                <a
                  href={appPath(`/teacher/${encodeURIComponent(DEMO_LECTURE.lectureId)}`)}
                  className="btn btn-dark mt-1 self-start text-[16px]"
                >
                  Open class insights
                  <ArrowRightIcon size={16} strokeWidth={2.4} />
                </a>
              </div>

              <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-2.5">
                <div
                  role="img"
                  aria-label="Sample class heatmap: the darkest slices fall at 01:30, 04:00 and 05:30"
                  className="grid grid-cols-12 gap-1.5"
                >
                  {HEATMAP_CELLS.map((c, i) => (
                    <span key={i} className={`h-10 rounded-[10px] sm:h-14 ${c}`} />
                  ))}
                </div>
                <div aria-hidden="true" className="flex justify-between font-mono text-[12px] text-ink-subtle">
                  <span>00:00</span>
                  <span>03:00</span>
                  <span>06:00</span>
                </div>
                <ul aria-label="Heatmap key" className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-ink-muted">
                  <li className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-3.5 rounded-[4px] bg-ink" />
                    most of the room
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-3.5 rounded-[4px] bg-accent-light" />
                    some
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-3.5 rounded-[4px] border border-line bg-desk" />
                    too few to show
                  </li>
                </ul>
              </div>
            </Reveal>

            <Reveal className="grid items-center gap-8 rounded-[32px] border border-line bg-white p-[clamp(24px,4vw,48px)] shadow-hairline md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="flex flex-col gap-3.5">
                <p className="kicker inline-flex items-center gap-2">
                  <StudentIcon size={18} />
                  For students
                </p>
                <h3 className="font-display text-[clamp(26px,3vw,36px)] leading-[1.08] font-extrabold tracking-[-0.03em] text-balance text-ink">
                  For anyone who has nodded along, then realized three slides later they were lost.
                </h3>
              </div>
              <Points items={STUDENT_POINTS} dot="bg-accent" />
            </Reveal>
          </div>
        </section>

        {/* ───────────── Privacy ───────────── */}
        <section id="privacy" aria-labelledby="privacy-title">
          <div className="container-x section-y pt-0 sm:pt-0">
            <SectionHeader
              id="privacy-title"
              kicker="Privacy"
              title={
                <>
                  Your notes stay <Highlight>yours</Highlight>.
                </>
              }
              lead="TraceIt looks closely at how you learn, so it’s built to keep that close, too."
            />
            <Stagger className="mt-10 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
              {PRIVACY.map(({ title, body, icon: I }) => (
                <StaggerItem key={title} as="article" className="card flex h-full flex-col gap-3 rounded-[24px] p-6">
                  <span className="inline-flex size-12 items-center justify-center rounded-md bg-ink text-highlight">
                    <I size={22} />
                  </span>
                  <h3 className="font-sans text-[18px] font-bold tracking-normal text-ink">{title}</h3>
                  <p className="text-[15px] leading-relaxed text-pretty text-ink-muted">{body}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ───────────── Questions ───────────── */}
        <section id="faq" aria-labelledby="faq-title">
          <div className="container-x section-y pt-0 sm:pt-0">
            <SectionHeader
              id="faq-title"
              kicker="Questions"
              title={
                <>
                  Questions, <Highlight>answered</Highlight>.
                </>
              }
            />
            <div className="mt-10">
              <Faq />
            </div>
          </div>
        </section>

        {/* ───────────── Final CTA ───────────── */}
        <section aria-labelledby="cta-title" className="container-x pb-[72px]">
          <Reveal className="on-dark relative isolate flex flex-col items-center gap-[22px] overflow-hidden rounded-[36px] bg-accent px-[clamp(24px,5vw,64px)] py-[clamp(40px,6vw,80px)] text-center text-white">
            <span
              aria-hidden="true"
              className="absolute top-[30px] left-10 hidden -rotate-[8deg] font-hand text-[30px] text-accent-line md:block"
            >
              x² → 2x ✓
            </span>
            <span
              aria-hidden="true"
              className="absolute right-[50px] bottom-[34px] hidden rotate-6 font-hand text-[30px] text-accent-line md:block"
            >
              f′(g(x))·g′(x)
            </span>
            <h2
              id="cta-title"
              className="max-w-[820px] font-display text-[clamp(36px,5vw,68px)] leading-none font-extrabold tracking-[-0.04em] text-balance"
            >
              Make your next mistake <span className="hl px-3">count</span>.
            </h2>
            <p className="max-w-[560px] text-[19px] leading-[1.55] text-pretty text-[#e3e0ff]">
              Open the sample calculus lecture, scribble a few lines, and watch your learning trail fill in.
            </p>
            <a href={APP_URL} className="btn btn-light min-h-14 rounded-[18px] px-[30px] text-[18px] font-extrabold">
              Launch TraceIt
              <ArrowUpRightIcon size={18} strokeWidth={2.4} />
            </a>
          </Reveal>
        </section>
      </main>

      {/* ───────────── Footer ───────────── */}
      <footer className="container-x pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 text-[14px] text-ink-subtle">
          <p className="inline-flex items-center gap-2">
            <TraceItMark size={22} />
            <span className="font-display font-extrabold text-ink">TraceIt</span>
            <span aria-hidden="true">·</span> made for people who cross things out
            <span aria-hidden="true">·</span> <span className="font-hand text-[19px] text-accent">learning is in the process</span>
          </p>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-1.5">
              {[
                { href: "#how", label: "How it works" },
                { href: "#try", label: "Try it" },
                { href: "#demo", label: "Demo video" },
                { href: "#faq", label: "Questions" },
              ].map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="inline-flex min-h-11 items-center rounded-md px-2.5 hover:text-ink">
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={GITHUB_URL}
                  rel="noopener"
                  className="inline-flex min-h-11 items-center gap-1 rounded-md px-2.5 hover:text-ink"
                >
                  Source on GitHub
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <p className="mt-6 border-t border-line pt-6 text-[13px] text-ink-subtle">
          © 2026 TraceIt · Built by Pranav Chowdary, Nagasai Kakani and Aasrith Mandava
        </p>
      </footer>

      <AskLauncher />
    </>
  );
}
