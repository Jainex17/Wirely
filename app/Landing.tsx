import Link from "next/link";
import { ArrowRight, KeyRound, MousePointerClick, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WIRE_MODEL_OPTIONS } from "@/lib/wireModels";

const MODES = [
  {
    value: "single_page",
    name: "Single page",
    body: "One brief becomes one finished page, sectioned and styled.",
  },
  {
    value: "concept_variants",
    name: "Concepts",
    body: "Two or three directions for the same brief, generated side by side.",
  },
  {
    value: "information_architecture",
    name: "Website pages",
    body: "Home, About, Pricing and Contact as one linked set sharing a layout.",
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

function Hero() {
  return (
    <section className="relative isolate flex min-h-[calc(100dvh-4rem)] items-center overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="ribbon ribbon-left rings-enter" />
        <div className="ribbon ribbon-right rings-enter" />
      </div>
      <div className="hero-dots pointer-events-none absolute inset-0 -z-10" />

      <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <h1 className="enter enter-1 font-display text-[clamp(2.5rem,6vw,4.25rem)] font-semibold leading-[0.98] tracking-[-0.04em]">
          Describe a screen.
          <br />
          Wirely writes the page.
        </h1>
        <p className="enter enter-2 mx-auto mt-6 max-w-[48ch] text-base text-muted-foreground sm:text-lg">
          You get real HTML on a canvas. Ask for changes, link the pages, and click
          through it.
        </p>

        <form action="/login" method="get" className="enter enter-3 mt-10 text-left">
          <input type="hidden" name="next" value="/" />

          <div className="composer pane sweep overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-xl transition-[border-color] duration-300">
            <label htmlFor="landing-prompt" className="sr-only">
              Describe what you want to build
            </label>
            <textarea
              id="landing-prompt"
              name="prompt"
              rows={5}
              maxLength={500}
              placeholder="A booking page for a two-chair barbershop, dark, with a weekly calendar..."
              className="w-full resize-none bg-transparent px-5 pt-5 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/80 focus:outline-none sm:text-lg"
            />

            <div className="flex items-center justify-between gap-3 p-3">
              <p className="pl-2 text-xs text-muted-foreground">
                Wirely reads the brief and decides how many pages to make.
              </p>

              <Button type="submit" size="icon" aria-label="Generate this page">
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
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
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
            <article className="reveal pane relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-8 transition-transform duration-300 hover:-translate-y-1 lg:col-span-4 lg:min-h-[19rem]">
              <div className="rings pointer-events-none absolute -right-40 -top-32 size-[30rem] opacity-70" />
              <MousePointerClick className="size-5 text-primary" />
              <div className="relative mt-16">
                <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  Edit one element, not the file
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Point at a heading, a section or a button and describe the change.
                  Wirely rewrites that node and leaves the rest of the page untouched.
                </p>
              </div>
            </article>

            <article className="reveal pane flex flex-col justify-between rounded-2xl border border-border bg-card p-8 transition-transform duration-300 hover:-translate-y-1 lg:col-span-2">
              <KeyRound className="size-5 text-primary" />
              <div className="mt-16">
                <p className="font-display text-6xl font-semibold leading-none tracking-tighter">
                  {modelCount}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  models across four providers, all running on your own key.
                </p>
              </div>
            </article>

            <article className="reveal pane flex flex-col justify-between rounded-2xl border border-border bg-card p-8 transition-transform duration-300 hover:-translate-y-1 lg:col-span-2">
              <Workflow className="size-5 text-primary" />
              <div className="mt-16">
                <h3 className="font-display text-2xl font-semibold tracking-tight">
                  Click through it
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Generated pages link to each other, so a multi-page brief is walkable
                  the moment it finishes.
                </p>
              </div>
            </article>

            <article className="reveal pane rounded-2xl border border-border bg-card p-8 lg:col-span-4">
              <h3 className="font-display text-2xl font-semibold tracking-tight">
                One brief, three answers
              </h3>
              <dl className="mt-6">
                {MODES.map((mode) => (
                  <div
                    key={mode.value}
                    className="grid gap-1 border-t border-border py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6"
                  >
                    <dt className="text-sm text-foreground">{mode.name}</dt>
                    <dd className="text-sm leading-relaxed text-muted-foreground">
                      {mode.body}
                    </dd>
                  </div>
                ))}
              </dl>
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
                  generation runs on your own quota. Keys are encrypted before they are
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
              Bring a key. Ship a page.
            </h2>
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
