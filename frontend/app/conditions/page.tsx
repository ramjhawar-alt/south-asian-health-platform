import Link from "next/link";
import { CONDITIONS } from "@/lib/conditions-data";

export default function ConditionsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 w-full">
      {/* Header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--sidebar-active)] border border-[var(--sidebar-active-border)] text-[var(--primary)] text-xs font-semibold mb-4">
          South Asian Health Library
        </div>
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-3">
          Conditions affecting South Asian health
        </h1>
        <p className="text-[var(--muted-foreground)] text-sm leading-relaxed max-w-2xl">
          South Asians face distinct health risks that are often poorly understood by mainstream medicine.
          Each condition below explains what it is, why South Asians are disproportionately affected,
          and what the latest research says.
        </p>
      </div>

      {/* Conditions grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CONDITIONS.map((c) => (
          <Link
            key={c.slug}
            href={`/conditions/${c.slug}`}
            className={`group rounded-2xl border p-5 transition-all hover:shadow-md hover:-translate-y-0.5 ${c.color} ${c.borderColor}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-4 ${c.iconBg}`}>
              {c.icon}
            </div>
            <h2 className="font-bold text-sm text-[var(--foreground)] mb-2 leading-snug">
              {c.name}
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed mb-4 line-clamp-3">
              {c.tagline}
            </p>

            {/* Stats row */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--primary)] group-hover:underline">
                Learn more →
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="mt-12 bg-[var(--sidebar-active)] border border-[var(--sidebar-active-border)] rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-[var(--foreground)] mb-1">Have a specific question?</h3>
          <p className="text-sm text-[var(--muted-foreground)]">Ask our research-backed AI — answers are cited from peer-reviewed literature.</p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <Link href="/chat" className="px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary-hover)] transition-colors whitespace-nowrap">
            Ask a Question →
          </Link>
          <Link href="/assess" className="px-4 py-2 rounded-xl border border-[var(--card-border)] bg-white text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors whitespace-nowrap">
            Check My Risk →
          </Link>
        </div>
      </div>
    </div>
  );
}
