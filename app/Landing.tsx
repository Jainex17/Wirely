import Link from "next/link";
import { ArrowRight, MousePointerClick, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WIRE_MODEL_OPTIONS } from "@/lib/wireModels";

const MODES = [
  {
    value: "single_page",
    name: "Single page",
    body: "One brief becomes one finished page, sectioned and styled.",
    shape: "one",
  },
  {
    value: "concept_variants",
    name: "Concepts",
    body: "Two or three takes on the same brief, side by side, in one run.",
    shape: "row",
  },
  {
    value: "information_architecture",
    name: "Website pages",
    body: "Home, About, Pricing and Contact as one linked set sharing a layout.",
    shape: "grid",
  },
] as const;

const PROVIDERS = [
  { name: "Google AI Studio", unlocks: "Gemini Flash and Pro" },
  { name: "OpenRouter", unlocks: "Gemini, GLM and Nemotron" },
  { name: "Z.ai", unlocks: "GLM Flash" },
  { name: "Unsplash", unlocks: "Photography inside generated pages" },
] as const;

const CHIPS = [
  "A landing page for a plant care subscription",
  "A pricing page with a yearly toggle",
  "A multi-page site for a design studio",
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
          Idea to design,
          <br />
          in{" "}
          <span className="lightspeed">
            <span className="lightspeed-word">lightspeed.</span>
            <span className="lightspeed-streaks" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </span>
        </h1>
        <p className="enter enter-2 mx-auto mt-6 max-w-[48ch] text-base text-muted-foreground sm:text-lg">
          Describe a screen and watch it build on the canvas. Explore a few looks at
          once, refine the one you like, then click through it.
        </p>

        <form action="/login" method="get" className="enter enter-3 mx-auto mt-9 max-w-2xl text-left">
          <input type="hidden" name="next" value="/" />

          <div className="composer pane relative overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-xl transition-[border-color] duration-300">
              <span className="beam" aria-hidden>
                <span className="beam-spin" />
              </span>
            <label htmlFor="landing-prompt" className="sr-only">
              Describe what you want to build
            </label>
            <textarea
              id="landing-prompt"
              name="prompt"
              rows={3}
              maxLength={500}
              placeholder="A booking page for a two-chair barbershop, dark, with a weekly calendar..."
              className="max-h-56 w-full resize-none bg-transparent px-4 pt-4 text-base leading-relaxed text-foreground [field-sizing:content] placeholder:text-muted-foreground/80 focus:outline-none"
            />

            <div className="flex items-center justify-end gap-3 px-3 pb-3">
              <Button type="submit" size="icon-sm" aria-label="Generate this page">
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </form>

        <div className="enter enter-4 mt-6 flex flex-wrap justify-center gap-2">
          {CHIPS.map((chip) => (
            <Link
              key={chip}
              href={`/login?next=/&prompt=${encodeURIComponent(chip)}`}
              className="rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:border-foreground/25 hover:text-foreground"
            >
              {chip}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const modelCount = WIRE_MODEL_OPTIONS.length;

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
              <Link href="/login">Start building</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main>
        <Hero />

        <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <div className="grid gap-4 lg:grid-cols-6">
            <article className="reveal pane rounded-2xl border border-border bg-card p-8 lg:col-span-4">
              <h2 className="font-display text-3xl font-semibold tracking-tight">
                Explore several looks at once
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                Say how much you want back. Wirely plans the run and fills the canvas
                as each page lands.
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
                {modelCount}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                models across four providers, every run on your own key.
              </p>
            </article>

            <article className="reveal pane rounded-2xl border border-border bg-card p-8 lg:col-span-3">
              <MousePointerClick className="size-5 text-primary" />
              <h3 className="mt-6 font-display text-xl font-semibold tracking-tight">
                Change one thing, not the whole page
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Point at a heading, a section or a button and say what should change.
                Wirely rewrites that piece and leaves the rest of the page alone.
              </p>
            </article>

            <article className="reveal pane rounded-2xl border border-border bg-card p-8 lg:col-span-3">
              <Workflow className="size-5 text-primary" />
              <h3 className="mt-6 font-display text-xl font-semibold tracking-tight">
                Hand it off clickable
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Pages link to each other, so a multi-page brief is walkable the moment
                it finishes. Share it and let people try it.
              </p>
            </article>
          </div>
        </section>

        <section className="border-y border-border bg-card/30">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
            <div className="grid gap-12 lg:grid-cols-12 lg:gap-6">
              <div className="reveal lg:col-span-5">
                <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  Your keys, your models
                </h2>
                <p className="mt-4 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
                  Wirely does not resell inference. Connect a provider once and every
                  run goes through your own quota, starting on a free tier. Keys are
                  encrypted before they are stored and never sent back to the browser.
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
              Your ideas get real in Wirely. Bring a key and start with the next one.
            </p>
            <Button asChild size="lg" className="mt-10">
              <Link href="/login">
                Start building
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
