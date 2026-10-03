import Image from "next/image";
import Link from "next/link";
import { ArrowRight, SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import WirelyMark from "@/components/icons/WirelyMark";
import LandingHeader from "./LandingHeader";
import {
  LANDING_DIRECTIONS,
  LANDING_FRAME,
  LANDING_PICKED_HTML,
  LANDING_REVIEW_HTML,
} from "./landingExamples";

const HERO_PROMPT = "Design three different layouts for a habit tracker.";

const REPO_URL = "https://github.com/Jainex17/Wirely";
const CTA_LABEL = "Connect your agent";
const HERO_END_ID = "hero-end";

// Press feedback shared by every button on the page.
// A screen inside a feature card rises a little while the card is hovered.
const LIFT =
  "transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-2";
const PRESS = "transition-transform duration-150 active:scale-[0.97]";
// The trailing arrow nudges right when its button or link is hovered.
const NUDGE = "transition-transform duration-200 group-hover:translate-x-0.5";

// Simple Icons dropped the OpenAI mark, so Codex uses a plain terminal glyph.
const AGENTS = [
  { name: "Claude Code", logo: "claude" },
  { name: "Cursor", logo: "cursor" },
  { name: "Codex", logo: null },
  { name: "opencode", logo: "opencode" },
] as const;

/** A brand mark from Simple Icons, tinted to the page's foreground. */
function BrandIcon({ slug, className = "size-4" }: { slug: string; className?: string }) {
  return (
    <Image
      src={`https://cdn.simpleicons.org/${slug}/e9ecf5`}
      alt=""
      width={20}
      height={20}
      unoptimized
      className={className}
    />
  );
}

const PROVIDERS = ["Google AI Studio", "OpenRouter", "Z.ai", "Unsplash"] as const;

/**
 * One page at phone size, scaled down the way the canvas shows it. The frame
 * is sandboxed with no scripts: the examples are static HTML, and the landing
 * page must never give a srcdoc its origin.
 */
function ScreenFrame({
  html,
  title,
  scale,
  className = "",
  lazy = false,
}: {
  html: string;
  title: string;
  scale: number;
  className?: string;
  /** Below-the-fold frames load near the viewport, so their write plays there. */
  lazy?: boolean;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[22px] bg-background ring-1 ring-white/10 ${className}`}
      style={{ width: LANDING_FRAME.width * scale, height: LANDING_FRAME.height * scale }}
    >
      <iframe
        title={title}
        srcDoc={html}
        sandbox=""
        loading={lazy ? "lazy" : "eager"}
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{
          width: LANDING_FRAME.width,
          height: LANDING_FRAME.height,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
}

function CanvasPreview() {
  return (
    <div className="pane relative overflow-hidden rounded-2xl border border-border bg-[#15171c]">
      <div className="flex h-11 items-center justify-between gap-6 border-b border-white/[0.06] px-4">
        <span className="text-[13px] font-medium text-foreground">Habit tracker</span>
        <span className="flex min-w-0 overflow-hidden font-mono text-xs text-muted-foreground">
          <span aria-hidden>&gt;&nbsp;</span>
          <span
            className="type-in"
            style={{ "--chars": HERO_PROMPT.length } as React.CSSProperties}
          >
            {HERO_PROMPT}
          </span>
        </span>
      </div>
      <div className="relative overflow-x-auto">
        <div className="canvas-dots pointer-events-none absolute inset-0" />
        <div className="relative flex min-w-max justify-center gap-8 px-8 pb-10 pt-8 sm:gap-12">
          {LANDING_DIRECTIONS.map((direction, index) => (
            <figure
              key={direction.title}
              className="enter group"
              style={{ animationDelay: `${420 + index * 260}ms` }}
            >
              <figcaption className="mb-2.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                {direction.title}
              </figcaption>
              {/* The same sky outline the editor draws on a hovered frame. */}
              <ScreenFrame
                html={direction.html}
                title={direction.title}
                scale={0.62}
                className="transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-sky-400/70"
              />
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate -mt-16 overflow-hidden pt-16">
      <div className="ribbon-field pointer-events-none -z-10">
        <div className="ribbon ribbon-core rings-enter" />
      </div>
      <div className="hero-dots pointer-events-none absolute inset-0 -z-10" />

      <div className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-20">
        <h1 className="enter enter-1 max-w-3xl font-display text-[clamp(2.6rem,6vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.04em]">
          The design canvas for your coding agent.
        </h1>
        <p className="enter enter-2 mt-6 max-w-[44ch] text-lg leading-relaxed text-muted-foreground">
          Your agent designs the screens on the plan you already pay for. Wirely puts them
          side by side.
        </p>
        <div className="enter enter-3 mt-9 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className={`group rounded-full px-6 ${PRESS}`}>
            <Link href="/login">
              {CTA_LABEL}
              <ArrowRight className={`size-4 ${NUDGE}`} />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className={`rounded-full bg-transparent px-6 ${PRESS}`}
          >
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              <BrandIcon slug="github" />
              Star on GitHub
            </a>
          </Button>
        </div>

        <div id={HERO_END_ID} />

        <div className="enter enter-4 mt-16">
          <div className="tilt-in">
            <CanvasPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

function AgentStrip() {
  return (
    <section className="border-y border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">Works with any MCP client, including</p>
        <ul className="flex flex-wrap items-center gap-x-10 gap-y-4">
          {AGENTS.map((agent) => (
            <li
              key={agent.name}
              className="flex items-center gap-2.5 text-[15px] text-foreground/70 transition-colors hover:text-foreground"
            >
              {agent.logo ? (
                <BrandIcon slug={agent.logo} className="size-5 opacity-85" />
              ) : (
                <SquareTerminal className="size-5 opacity-85" strokeWidth={1.75} />
              )}
              {agent.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ConnectSection({ origin }: { origin: string }) {
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-6 py-24 lg:grid-cols-12 lg:items-center lg:gap-12 sm:py-32">
      <div className="reveal lg:col-span-5">
        <h2 className="font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
          One paste to connect.
        </h2>
        <p className="mt-5 max-w-[42ch] text-base leading-relaxed text-muted-foreground">
          Sign in and Wirely writes an install prompt with your token in it. Paste it into
          your agent and it adds Wirely to its own config.
        </p>
        <a
          href={`${REPO_URL}#mcp-server`}
          target="_blank"
          rel="noreferrer"
          className="group mt-7 inline-flex items-center gap-1.5 text-sm text-primary transition-colors hover:text-foreground"
        >
          Manual setup for every client
          <ArrowRight className={`size-3.5 ${NUDGE}`} />
        </a>
      </div>

      <div className="reveal pane overflow-hidden rounded-2xl border border-border bg-card lg:col-span-7">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 text-[13px]">
          <span className="text-foreground">Claude Code</span>
          <span className="text-muted-foreground">Cursor, Codex, and opencode edit their config</span>
        </div>
        <pre className="overflow-x-auto px-5 py-6 font-mono text-[13px] leading-7 text-foreground/90">
          <span className="text-muted-foreground">$ </span>claude mcp add --transport http wirely \
          {"\n"}
          {"    "}
          {origin}/api/mcp \{"\n"}
          {"    "}--header <span className="text-primary">&quot;Authorization: Bearer wirely_…&quot;</span>{" "}
          --scope user
        </pre>
        <div className="border-t border-border px-5 py-4 font-mono text-xs text-muted-foreground">
          Tools: create_project, add_page, patch_page, get_page_png, list_comments, and 10 more
        </div>
      </div>
    </section>
  );
}

function FeatureGrid() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-24 sm:pb-32">
      <div className="grid gap-4 lg:grid-cols-12">
        <article className="reveal group relative flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-border transition-colors duration-300 hover:border-white/15 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--primary)_14%,var(--card))_0%,var(--card)_55%)] lg:col-span-7">
          <div className="p-8">
            <h3 className="font-display text-2xl font-semibold tracking-tight">
              Point at one element.
            </h3>
            <p className="mt-2 max-w-[40ch] text-sm leading-relaxed text-muted-foreground">
              Pick it on the canvas and copy its link. Your agent edits that element and
              leaves the rest of the page alone.
            </p>
          </div>
          <div className="relative mt-auto flex justify-center">
            <ScreenFrame
              html={LANDING_PICKED_HTML}
              title="A page with one element picked"
              scale={0.58}
              className={`-mb-40 rounded-b-none ${LIFT}`}
              lazy
            />
            {/* Sits level with the picked "Today" card inside the frame. */}
            <code className="absolute bottom-24 right-6 hidden whitespace-nowrap rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] text-muted-foreground shadow-lg sm:block">
              /wire/7f3c?page=a91e&amp;node=<span className="text-primary">n4k2</span>
            </code>
          </div>
        </article>

        <article className="reveal group relative flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors duration-300 hover:border-white/15 lg:col-span-5">
          <div className="p-8">
            <h3 className="font-display text-2xl font-semibold tracking-tight">
              Share it for review.
            </h3>
            <p className="mt-2 max-w-[36ch] text-sm leading-relaxed text-muted-foreground">
              Turn on a review link. Reviewers pin comments right on the screens, and you
              see them on your canvas.
            </p>
          </div>
          <div className="mt-auto flex justify-center">
            <ScreenFrame
              html={LANDING_REVIEW_HTML}
              title="A page with review comments pinned on it"
              scale={0.58}
              className={`-mb-40 rounded-b-none ${LIFT}`}
              lazy
            />
          </div>
        </article>

        <article className="reveal flex flex-col gap-6 rounded-2xl border border-border bg-card p-8 sm:flex-row sm:items-center sm:justify-between lg:col-span-12">
          <div className="flex items-baseline gap-6">
            <p className="font-display text-7xl font-semibold leading-none tracking-tighter text-primary">
              $0
            </p>
            <p className="max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
              Wirely has no plans and no credits. It is open source, and your agent runs on
              the subscription you already have.
            </p>
          </div>
          <Button asChild variant="outline" className={`shrink-0 rounded-full bg-transparent ${PRESS}`}>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              <BrandIcon slug="github" />
              Star on GitHub
            </a>
          </Button>
        </article>
      </div>
    </section>
  );
}

function KeySection() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-16 lg:flex-row lg:items-center lg:justify-between">
        <div className="reveal max-w-md">
          <h2 className="font-display text-2xl font-semibold tracking-tight">No agent? Bring a key.</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Wirely can generate screens itself on your own provider key, starting on a free
            Gemini tier. Keys are encrypted at rest.
          </p>
        </div>
        <ul className="reveal flex flex-wrap gap-2">
          {PROVIDERS.map((provider) => (
            <li
              key={provider}
              className="rounded-full border border-border px-4 py-2 text-sm text-foreground/85"
            >
              {provider}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-6 pb-24">
      <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl border border-border px-8 py-20 sm:px-14 sm:py-24">
        <div className="rings-glow pointer-events-none absolute inset-0 -z-10" />
        <div className="hero-dots pointer-events-none absolute inset-0 -z-10" />
        <h2 className="max-w-2xl font-display text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-[1.02] tracking-[-0.04em]">
          See multiple directions before your agent builds one.
        </h2>
        <Button asChild size="lg" className={`group mt-10 rounded-full px-6 ${PRESS}`}>
          <Link href="/login">
            {CTA_LABEL}
            <ArrowRight className={`size-4 ${NUDGE}`} />
          </Link>
        </Button>
      </div>
    </section>
  );
}

export default function Landing({ origin }: { origin: string }) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <LandingHeader markerId={HERO_END_ID}>
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <WirelyMark className="size-6" />
            Wirely
          </Link>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="hidden rounded-full sm:inline-flex">
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                <BrandIcon slug="github" />
                GitHub
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-full">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm" className={`ml-1 rounded-full px-4 ${PRESS}`}>
              <Link href="/login">{CTA_LABEL}</Link>
            </Button>
          </div>
        </nav>
      </LandingHeader>

      <main>
        <Hero />
        <AgentStrip />
        <ConnectSection origin={origin} />
        <FeatureGrid />
        <KeySection />
        <FinalCta />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-muted-foreground">
          <span className="flex items-center gap-2 font-display font-semibold text-foreground">
            <WirelyMark className="size-5" />
            Wirely
          </span>
          <div className="flex items-center gap-6">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
              GitHub
            </a>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
