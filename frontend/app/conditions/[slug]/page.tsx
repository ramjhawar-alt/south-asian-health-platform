import Link from "next/link";
import { notFound } from "next/navigation";
import { CONDITIONS, getCondition } from "@/lib/conditions-data";

export function generateStaticParams() {
  return CONDITIONS.map((c) => ({ slug: c.slug }));
}

export default async function ConditionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const condition = getCondition(slug);
  if (!condition) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 w-full">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] mb-6">
        <Link href="/" className="hover:text-[var(--foreground)] transition-colors">Home</Link>
        <span>/</span>
        <Link href="/conditions" className="hover:text-[var(--foreground)] transition-colors">Conditions</Link>
        <span>/</span>
        <span className="text-[var(--foreground)] font-medium">{condition.name}</span>
      </nav>

      {/* Hero card */}
      <div className={`rounded-2xl border p-6 mb-8 ${condition.color} ${condition.borderColor}`}>
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 ${condition.iconBg}`}>
            {condition.icon}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">{condition.name}</h1>
            <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{condition.tagline}</p>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-[var(--card-border)]">
          {condition.southAsianStats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-xl font-extrabold text-[var(--primary)]">{s.value}</div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 leading-snug">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Prevalence */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-[var(--foreground)] mb-3 flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-[var(--primary)] flex-shrink-0" />
          Prevalence in South Asians
        </h2>
        <div className="bg-[var(--sidebar-active)] border border-[var(--sidebar-active-border)] rounded-xl px-5 py-4">
          <p className="text-sm text-[var(--foreground)] leading-relaxed">{condition.prevalence}</p>
        </div>
      </section>

      {/* Why higher risk */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-[var(--foreground)] mb-3 flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-[var(--saffron)] flex-shrink-0" />
          Why South Asians are at higher risk
        </h2>
        <div className="space-y-2.5">
          {condition.whyHigherRisk.map((reason, i) => (
            <div key={i} className="flex items-start gap-3 bg-white border border-[var(--card-border)] rounded-xl px-4 py-3">
              <span className="w-5 h-5 rounded-full bg-[var(--saffron)] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-[var(--foreground)] leading-relaxed">{reason}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Key research findings */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-[var(--foreground)] mb-3 flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-[var(--success)] flex-shrink-0" />
          Key research findings
        </h2>
        <div className="space-y-2.5">
          {condition.keyFindings.map((finding, i) => (
            <div key={i} className="flex items-start gap-3 bg-white border border-[var(--card-border)] rounded-xl px-4 py-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[var(--success)] flex-shrink-0 mt-0.5">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-sm text-[var(--foreground)] leading-relaxed">{finding}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ask about it */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-[var(--foreground)] mb-3 flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-[var(--primary)] flex-shrink-0" />
          Ask the research assistant
        </h2>
        <div className="space-y-2">
          {condition.chatQuestions.map((q) => (
            <Link
              key={q}
              href={`/chat?q=${encodeURIComponent(q)}`}
              className="flex items-center gap-3 bg-white border border-[var(--card-border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] hover:border-[var(--primary)]/40 hover:bg-[var(--sidebar-active)] transition-all group"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[var(--primary)] flex-shrink-0">
                <path d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="flex-1">{q}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-[var(--muted-foreground)] group-hover:text-[var(--primary)] transition-colors">
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
        </div>
      </section>

      {/* Navigation */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-[var(--card-border)]">
        <Link href="/conditions" className="flex-1 py-3 rounded-xl border border-[var(--card-border)] bg-white text-sm font-semibold text-center text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
          ← All Conditions
        </Link>
        <Link href="/assess" className="flex-1 py-3 rounded-xl bg-[var(--saffron)] text-white text-sm font-semibold text-center hover:bg-[var(--saffron-hover)] transition-colors">
          Check My Risk Profile →
        </Link>
      </div>
    </div>
  );
}
