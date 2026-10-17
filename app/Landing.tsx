import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, SquareTerminal } from "lucide-react";
import WirelyMark from "@/components/icons/WirelyMark";
import { CANONICAL_APP_ORIGIN } from "@/lib/appUrl";
import { REPO_URL, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import HeroFilm from "./HeroFilm";
import { CanvasWindow } from "./LandingCanvas";
import LandingHeader from "./LandingHeader";
import LandingTranscript from "./LandingTranscript";

const HERO_END_ID = "hero-end";

// The trailing arrow nudges right when its button or link is hovered.
const NUDGE = "transition-transform duration-200 group-hover:translate-x-0.5";

// Section copy: an accent eyebrow in the display face, then the heading.
const EYEBROW = "font-display text-lg font-medium text-primary";
const H2 =
  "font-display text-4xl font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[2.75rem]";
const BODY = "text-[17px] leading-relaxed text-foreground/70";

// Simple Icons dropped the OpenAI mark, so Codex uses a plain terminal glyph.
const AGENTS = [
  { name: "Claude Code", logo: "claude", tint: "d97757" },
  { name: "Cursor", logo: "cursor", tint: "0b1020" },
  { name: "Codex", logo: null, tint: "0b1020" },
  { name: "opencode", logo: "opencode", tint: "0b1020" },
] as const;

const PROVIDERS = ["Google AI Studio", "OpenRouter", "Z.ai", "Unsplash"] as const;

const FREE_INCLUDES = [
  "Unlimited projects and pages",
  "Unlimited agent calls",
  "Review links with pinned comments",
  "Clickable prototypes",
  "Desktop and mobile frames",
  "The whole source, MIT licensed",
] as const;

const STEPS = [
  {
    n: "01",
    title: "Ask for directions, not a screen.",
    body: "Tell your agent what the screen is for and ask for three layouts. It writes each one as a self-contained HTML page and calls Wirely to put it on your canvas.",
  },
  {
    n: "02",
    title: "Compare them side by side.",
    body: "Frames fill in as each page lands. Pan, zoom, open the compare view, and look at the three next to each other instead of scrolling a chat for screenshots.",
  },
  {
    n: "03",
    title: "Point at what to change.",
    body: "Pick one element on the canvas and copy its link. The agent edits that element and leaves the rest of the page alone. Reviewers can pin comments the same way.",
  },
  {
    n: "04",
    title: "Hand the winner back.",
    body: "The agent reads the page it wrote, so the build matches the design instead of guessing from a screenshot.",
  },
] as const;

/** A brand mark from Simple Icons, tinted to the surface it sits on. */
function BrandIcon({
  slug,
  className = "size-4",
  tint = "0b1020",
}: {
  slug: string;
  className?: string;
  /** Hex without the hash. */
  tint?: string;
}) {
  return (
    <Image
      src={`https://cdn.simpleicons.org/${slug}/${tint}`}
      alt=""
      width={20}
      height={20}
      unoptimized
      className={className}
    />
  );
}

/** The white key: "Set up with" and the three agent marks. */
function SetUpKey() {
  return (
    <Link
      href="/login"
      className="key group inline-flex h-11 items-center gap-3 rounded-[10px] bg-white px-4 text-[14.5px] font-semibold text-[#0b1020]"
    >
      Set up with
      <span className="h-5 w-px bg-black/10" />
      <span className="flex items-center gap-2.5">
        <BrandIcon slug="claude" tint="d97757" />
        <BrandIcon slug="cursor" />
        <SquareTerminal className="size-4" strokeWidth={2} />
      </span>
      <ArrowRight className={`size-4 text-black/50 ${NUDGE}`} />
    </Link>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[15px] text-foreground/85">
      <span className="mt-1 grid size-4 shrink-0 place-items-center rounded-[4px] bg-primary/12 text-primary">
        <Check className="size-3" strokeWidth={3} />
      </span>
      {children}
    </li>
  );
}

function Hero() {
  return (
    <section className="relative -mt-16 pt-16">
      <div className="mx-auto max-w-6xl px-6 pb-16 pt-14 sm:pt-20">
        <p className={`enter enter-1 ${EYEBROW}`}>Free and open source</p>
        <h1 className="enter enter-1 mt-3 max-w-4xl font-display text-[clamp(2.75rem,6.2vw,4.6rem)] font-semibold leading-[1] tracking-[-0.04em]">
          The design canvas for your <span className="text-primary">coding agent</span>.
        </h1>
        <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-end">
          <p className={`enter enter-2 max-w-[48ch] lg:col-span-7 ${BODY}`}>
            Ask Claude Code, Cursor, or Codex for three directions. They land on a canvas side by
            side, you pick one, and the agent builds it in your codebase. All on the plan you
            already pay for.
          </p>
          <div className="enter enter-3 flex flex-col gap-3 lg:col-span-5 lg:items-end">
            <div className="flex flex-wrap items-center gap-3">
              <SetUpKey />
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="key inline-flex h-11 items-center gap-2 rounded-[10px] bg-white px-4 text-[14.5px] font-semibold text-[#0b1020]"
              >
                <BrandIcon slug="github" />
                Star on GitHub
              </a>
            </div>
            <p className="text-[13px] text-muted-foreground">No credits, no card, no server key.</p>
          </div>
        </div>
        <div id={HERO_END_ID} />

        {/* The illustration is a live scene: clouds drift, a cat on the front
            hill flicks its tail, and birds cross the sky now and then. */}
        <div className="enter enter-4 mt-12 h-[clamp(16rem,34vw,26rem)] overflow-hidden rounded-[22px] shadow-[inset_0_0_0_1px_rgb(11_16_32_/_0.12)]">
          <HeroFilm />
        </div>

        <p className="logos enter enter-4 mt-8 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm text-muted-foreground">
          <span>Works with</span>
          {AGENTS.map((agent) => (
            <span
              key={agent.name}
              className="logo flex items-center gap-2 font-semibold text-foreground"
            >
              {agent.logo ? (
                <BrandIcon slug={agent.logo} tint={agent.tint} className="size-[18px]" />
              ) : (
                <SquareTerminal className="size-[18px]" strokeWidth={2} />
              )}
              {agent.name}
            </span>
          ))}
          <span>and any MCP client.</span>
        </p>
      </div>
    </section>
  );
}

function CanvasSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-24 sm:pb-32">
      <div className="reveal flex flex-col gap-4 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={EYEBROW}>One prompt, three answers</p>
          <h2 className={`mt-3 ${H2}`}>
            Compare directions <em className="not-italic text-primary">side by side</em>.
          </h2>
        </div>
        <p className={`max-w-[38ch] ${BODY}`}>
          Your agent writes each screen as a page and puts it on the canvas while you watch.
        </p>
      </div>
      <div className="reveal">
        <CanvasWindow />
      </div>
    </section>
  );
}

function LoopSection() {
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-24 lg:grid-cols-12 lg:gap-16 sm:pb-32">
      <div className="lg:col-span-5">
        <p className={`reveal ${EYEBROW}`}>How it works</p>
        <h2 className={`reveal mt-3 ${H2}`}>
          Your agent designs. <em className="not-italic text-primary">You choose.</em>
        </h2>
        <ol className="mt-10 divide-y divide-border border-y border-border">
          {STEPS.map((step) => (
            <li key={step.n} className="reveal grid gap-4 py-7 sm:grid-cols-[3rem_1fr]">
              <span className="font-mono text-sm text-primary">{step.n}</span>
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 max-w-[44ch] text-[15px] leading-relaxed text-foreground/70">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="reveal self-start lg:sticky lg:top-24 lg:col-span-7">
        <LandingTranscript />
        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          The tool names are the ones the MCP server exposes.
        </p>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-24 lg:grid-cols-12 lg:gap-12 sm:pb-32">
      <div className="reveal lg:col-span-5">
        <p className={EYEBROW}>Pricing</p>
        <h2 className={`mt-3 ${H2}`}>
          Free, with <em className="not-italic text-primary">no asterisk</em>.
        </h2>
        <p className={`mt-4 max-w-[44ch] ${BODY}`}>
          No tiers, no credits, no cap on agent calls. Your agent runs on the subscription you
          already have, and pages render in a sandbox.
        </p>
        <p className="mt-6 flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
          <span className="mr-1">No agent? Bring a key:</span>
          {PROVIDERS.map((provider) => (
            <span
              key={provider}
              className="tile rounded-md px-2.5 py-1 text-[12.5px] font-medium text-foreground/85"
            >
              {provider}
            </span>
          ))}
        </p>
      </div>
      <div className="tile reveal rounded-[14px] p-7 lg:col-span-7 lg:p-9">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="flex items-baseline gap-2">
            <span className="font-display text-6xl font-semibold leading-none tracking-tighter">
              $0
            </span>
            <span className="text-base text-muted-foreground">forever</span>
          </p>
          <Link
            href="/login"
            className="key-primary group inline-flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-[14px] font-semibold text-white"
          >
            Connect your agent
            <ArrowRight className={`size-4 ${NUDGE}`} />
          </Link>
        </div>
        <ul className="mt-6 grid gap-2.5 border-t border-border pt-6 sm:grid-cols-2">
          {FREE_INCLUDES.map((item) => (
            <CheckItem key={item}>{item}</CheckItem>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">
          Setup is one line in your agent.{" "}
          <Link href="/docs" className="text-primary underline underline-offset-4">
            The docs
          </Link>{" "}
          cover Claude Code, Cursor, Codex, and opencode.
        </p>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-base font-semibold tracking-tight text-foreground"
          >
            <WirelyMark className="size-5" />
            Wirely
          </Link>
          <p className="mt-2 max-w-[44ch]">
            The design canvas for your coding agent. Free, open source, MIT licensed.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/docs" className="transition-colors hover:text-foreground">
            Docs
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}

// Tells search and AI answer engines what Wirely is, what it costs, and
// where the source lives, in a form they read without parsing the page.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: CANONICAL_APP_ORIGIN,
  description: SITE_DESCRIPTION,
  applicationCategory: "DesignApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires a modern web browser",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  sameAs: [REPO_URL],
};

export default function Landing() {
  return (
    <div className="theme-light paper min-h-[100dvh] overflow-x-clip text-foreground">
      <script
        type="application/ld+json"
        // Static JSON built above, never user input. The escape keeps a "<"
        // in any string from closing the script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c"),
        }}
      />
      <LandingHeader markerId={HERO_END_ID}>
        <nav className="flex h-14 items-center justify-between px-5">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight"
          >
            <WirelyMark className="size-6" />
            Wirely
          </Link>
          <div className="flex items-center gap-1 text-[14.5px] font-medium">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-foreground/75 transition-colors hover:text-foreground sm:flex"
            >
              <BrandIcon slug="github" />
              GitHub
            </a>
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 text-foreground/75 transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="key-primary ml-2 inline-flex h-9 items-center rounded-[10px] bg-primary px-4 text-white"
            >
              Start now
            </Link>
          </div>
        </nav>
      </LandingHeader>

      <main>
        <Hero />
        <CanvasSection />
        <LoopSection />
        <PricingSection />
      </main>

      <LandingFooter />
    </div>
  );
}
