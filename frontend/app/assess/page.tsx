import Link from "next/link";
import { AssessClientLoader } from "./assess-client-loader";

/** Evaluate per request so public deploys are not stuck on an old baked-in flag. */
export const dynamic = "force-dynamic";

/**
 * Risk assessment is gated for public deploys.
 * Set ASSESS_ENABLED=true in `.env.local` (local) or in Vercel **server** env (not `NEXT_PUBLIC_*`) to serve the full tool.
 */
export default function AssessPage() {
  if (process.env.ASSESS_ENABLED === "true") {
    return <AssessClientLoader />;
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-8 py-10 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">South Asian risk assessment</p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-[var(--foreground)]">Coming soon</h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--muted-foreground)]">
          This tool is still in development and is not available to the public yet. Check back later, or use Research Q&amp;A for
          evidence-based questions in the meantime.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/chat"
            className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-95"
          >
            Open Research Q&amp;A
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--card-border)] bg-white/80 px-5 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--nav-surface)]"
          >
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
