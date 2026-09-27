import Link from "next/link";
import { ArrowRight, MousePointerClick, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MCP_CLIENTS } from "@/lib/mcp/installPrompt";

const MODES = [
  {
    value: "single_page",
    name: "One screen",
    body: "A single page, written straight onto the canvas.",
    shape: "one",
  },
  {
    value: "concept_variants",
    name: "Directions",
    body: "Two or three different layouts of the same screen, side by side.",
    shape: "row",
  },
  {
    value: "information_architecture",
    name: "A whole site",
    body: "Home, About, Pricing and Contact as one linked set.",
    shape: "grid",
  },
] as const;

const STEPS = [
  {
    title: "Connect once",
    body: "Sign in, copy one prompt, and paste it into your agent. It installs Wirely itself.",
  },
  {
    title: "Ask for screens",
    body: "\"Design three layouts for a booking page.\" Your agent writes them onto the canvas while you watch.",
  },
  {
    title: "Pick and hand back",
    body: "Point at what to change, then ask the agent to build the one you picked in your codebase.",
  },
] as const;

const PROVIDERS = [
  { name: "Google AI Studio", unlocks: "Gemini Flash and Pro" },
  { name: "OpenRouter", unlocks: "Gemini, GLM and Nemotron" },
  { name: "Z.ai", unlocks: "GLM Flash" },
  { name: "Unsplash", unlocks: "Photography inside generated pages" },
] as const;


// A mode is easier to show than to describe: one page, three of it side by side,
// or a linked set. The blocks are page shapes, not a preview of real output.
function ModeShape({ shape }: { shape: (typeof MODES)[number]["shape"] }) {
  const cell = "rounded-sm border border-border bg-foreground/[0.06]";
  const lead = "rounded-sm border border-primary/40 bg-primary/15";

  return (
    <div
      className="aspect-[5/3] w-full rounded-lg border border-border bg-background/70 p-2"
      aria-hidden
    >
      {shape === "one" && <div className={`h-full w-full ${lead}`} />}

      {shape === "row" && (
        <div className="flex h-full gap-1.5">
          <div className={`flex-1 ${lead}`} />
          <div className={`flex-1 ${cell}`} />
          <div className={`flex-1 ${cell}`} />
        </div>
      )}

      {shape === "grid" && (
        <div className="grid h-full grid-cols-2 grid-rows-2 gap-1.5">
          <div className={lead} />
          <div className={cell} />
          <div className={cell} />
          <div className={cell} />
        </div>
      )}
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate -mt-16 flex min-h-[100dvh] items-center overflow-hidden border-b border-border pt-16">
      <div className="ribbon-field pointer-events-none -z-10">
        <div className="ribbon ribbon-core rings-enter" />
      </div>
      <div className="hero-dots pointer-events-none absolute inset-0 -z-10" />
      <div className="hero-foot pointer-events-none absolute inset-x-0 bottom-0 h-16 -z-10" />

      <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <h1 className="enter enter-1 font-display text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[0.98] tracking-[-0.04em]">
          The design canvas
          <br />
          for your{" "}
          <span className="lightspeed">
            <span className="lightspeed-word">coding agent.</span>
            <span className="lightspeed-streaks" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </span>
        </h1>
        <p className="enter enter-2 mx-auto mt-6 max-w-[50ch] text-base text-muted-foreground sm:text-lg">
          Your agent designs the screens on the plan you already pay for. Wirely
          lays them out side by side, so you can pick one, point at what to change,
          and hand it back to build.
        </p>

        <div className="enter enter-3 mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link href="/login">
              Connect your agent
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <p className="enter enter-4 mt-6 text-xs text-muted-foreground">
          Works with {MCP_CLIENTS.map((client) => client.label).join(", ")}, and any
          MCP client.
        </p>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-40">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="font-display text-lg font-semibold tracking-tight">
            Wirely
          </Link>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="rounded-full">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full px-4">
              <Link href="/login">Get started</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main>
        <Hero />

        <section className="mx-auto max-w-6xl px-6 pt-20 sm:pt-24">
          <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((step, index) => (
              <li key={step.title} className="reveal border-t border-border pt-5">
                <span className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="mt-2 font-display text-lg font-semibold tracking-tight">
                  {step.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <div className="grid gap-4 lg:grid-cols-6">
            <article className="reveal pane rounded-2xl border border-border bg-card p-8 lg:col-span-4">
              <h2 className="font-display text-3xl font-semibold tracking-tight">
                See several directions at once
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                Ask for options and each one lands as its own layout on the canvas,
                live, while the agent writes it.
              </p>

              <dl className="mt-7 grid gap-6 sm:grid-cols-3 sm:gap-5">
                {MODES.map((mode) => (
                  <div key={mode.value}>
                    <ModeShape shape={mode.shape} />
                    <dt className="mt-3 text-sm text-foreground">{mode.name}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {mode.body}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>

            <article className="reveal pane flex flex-col justify-center rounded-2xl border border-border bg-card p-8 lg:col-span-2">
              <p className="font-display text-7xl font-semibold leading-none tracking-tighter">
                $0
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Wirely charges nothing. Your agent runs on the subscription you
                already have.
              </p>
            </article>

            <article className="reveal pane rounded-2xl border border-border bg-card p-8 lg:col-span-3">
              <MousePointerClick className="size-5 text-primary" />
              <h3 className="mt-6 font-display text-xl font-semibold tracking-tight">
                Change one thing, not the whole page
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Pick a heading, a section or a button on the canvas and send its link
                to your agent. It edits that element and leaves the rest alone.
              </p>
            </article>

            <article className="reveal pane rounded-2xl border border-border bg-card p-8 lg:col-span-3">
              <Workflow className="size-5 text-primary" />
              <h3 className="mt-6 font-display text-xl font-semibold tracking-tight">
                Hand it off clickable
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Link pages into a clickable prototype, then share a review link where
                people pin comments on the screens.
              </p>
            </article>
          </div>
        </section>

        <section className="border-y border-border bg-card/30">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
            <div className="grid gap-12 lg:grid-cols-12 lg:gap-6">
              <div className="reveal lg:col-span-5">
                <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  No agent? Bring a key
                </h2>
                <p className="mt-4 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
                  Wirely can also generate screens itself on your own provider key,
                  starting on a free Gemini tier. Keys are encrypted before they are
                  stored and never sent back to the browser.
                </p>
              </div>

              <dl className="reveal lg:col-span-6 lg:col-start-7">
                {PROVIDERS.map((provider) => (
                  <div
                    key={provider.name}
                    className="flex flex-col justify-between gap-1 border-t border-border py-5 sm:flex-row sm:items-baseline sm:gap-8"
                  >
                    <dt className="text-base text-foreground">{provider.name}</dt>
                    <dd className="font-mono text-xs text-muted-foreground">
                      {provider.unlocks}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden">
          <div className="rings-glow pointer-events-none absolute inset-0 -z-10" />
          <div className="mx-auto max-w-4xl px-6 py-28 text-center sm:py-36">
            <h2 className="font-display text-[clamp(2.25rem,5.5vw,4rem)] font-semibold leading-[1] tracking-[-0.04em]">
              Prototype. Polish. Ship.
            </h2>
            <p className="mx-auto mt-6 max-w-[42ch] text-base text-muted-foreground">
              Connect your agent and start with the next screen.
            </p>
            <Button asChild size="lg" className="mt-10">
              <Link href="/login">
                Connect your agent
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-muted-foreground">
          <span className="font-display font-semibold text-foreground">Wirely</span>
          <Link href="/login" className="transition-colors hover:text-foreground">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
