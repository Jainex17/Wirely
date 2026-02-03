import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-lg p-8">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Openwire
          </p>
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to keep building your next launch.
          </p>
        </div>

        <form className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground" htmlFor="password">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border bg-background"
              />
              Remember me
            </label>
            <Link
              href="/"
              className="text-primary hover:underline underline-offset-4"
            >
              Forgot password?
            </Link>
          </div>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          No account yet?{" "}
          <Link
            href="/"
            className="text-primary hover:underline underline-offset-4"
          >
            Create one
          </Link>
        </div>
      </div>
    </main>
  );
}
