import Link from "next/link";

const STATS = [
  { value: "3–5×", label: "higher lifetime risk of type 2 diabetes vs. white Europeans at the same BMI" },
  { value: "10 yrs", label: "earlier onset of diabetes in South Asians compared to Western populations" },
  { value: "40%", label: "higher cardiovascular mortality in South Asians despite similar risk factors" },
];

const FEATURES = [
  {
    href: "/chat",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Research Q&A",
    description: "Ask any health question and receive answers grounded in peer-reviewed research specific to South Asian populations — with full citations.",
    cta: "Ask a Question →",
    badge: "AI-powered",
  },
  {
    href: "/assess",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Personal Risk Assessment",
    description: "A structured questionnaire that computes your personalised risk scores for diabetes, heart disease, and hypertension — using South Asian-calibrated thresholds.",
    cta: "Check My Risk →",
    badge: "Most useful",
    highlight: true,
  },
  {
    href: "/simulate",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Physiology Simulator",
    description: "Enter your health profile and model how your body may respond to exercise stress, metabolic changes, blood pressure treatment, or diabetes progression over time.",
    cta: "Run a Simulation →",
    badge: "Interactive",
  },
  {
    href: "/conditions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Conditions Library",
    description: "Explore the 8 most prevalent health conditions in South Asian communities — what they are, why South Asians are at higher risk, and what the research says.",
    cta: "Browse Conditions →",
    badge: "Education",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "You ask a question",
    description: "Type any health question — about a symptom, condition, medication, or risk factor.",
  },
  {
    step: "02",
    title: "We search the research",
    description: "Our system retrieves the most relevant peer-reviewed papers from a curated database of South Asian health research.",
  },
  {
    step: "03",
    title: "You get a sourced answer",
    description: "The AI synthesises the evidence into a clear, cited answer — with every claim traceable to its source paper.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex-1">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-[var(--background)] border-b border-[var(--card-border)]">
        {/* Decorative background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--sidebar-active)] rounded-full opacity-40 blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[var(--accent)] rounded-full opacity-60 blur-2xl translate-y-1/3 -translate-x-1/4" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 py-20 sm:py-28 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--sidebar-active)] border border-[var(--sidebar-active-border)] text-[var(--primary)] text-xs font-semibold mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
            Evidence-based · South Asian focused
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[var(--foreground)] leading-tight tracking-tight mb-6">
            South Asian health,
            <br />
            <span className="text-[var(--primary)]">understood through research</span>
          </h1>

          <p className="text-lg text-[var(--muted-foreground)] max-w-2xl mx-auto leading-relaxed mb-10">
            A platform built around the unique health risks of South Asian populations.
            Every answer is grounded in peer-reviewed science — not generic advice written for a different body.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/chat"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm hover:bg-[var(--primary-hover)] transition-colors shadow-md"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Ask a Research Question
            </Link>
            <Link
              href="/assess"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--saffron)] text-white font-semibold text-sm hover:bg-[var(--saffron-hover)] transition-colors shadow-md"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Check My Health Risk
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section className="bg-[var(--primary)] text-white">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-indigo-200 mb-8">
            Why South Asian health needs its own platform
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {STATS.map((s) => (
              <div key={s.value} className="text-center">
                <div className="text-4xl font-extrabold text-[var(--saffron)] mb-2">{s.value}</div>
                <p className="text-sm text-indigo-100 leading-relaxed">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-5xl mx-auto px-6 py-16 sm:py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)] mb-3">
            Everything you need in one place
          </h2>
          <p className="text-[var(--muted-foreground)] max-w-xl mx-auto text-sm leading-relaxed">
            Purpose-built tools that understand South Asian physiology — not repackaged generic health advice.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className={`group relative rounded-2xl border p-6 transition-all hover:shadow-md ${
                f.highlight
                  ? "border-[var(--saffron)] bg-[var(--accent)]"
                  : "border-[var(--card-border)] bg-white hover:border-[var(--primary)]/30"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  f.highlight
                    ? "bg-[var(--saffron)] text-white"
                    : "bg-[var(--sidebar-active)] text-[var(--primary)]"
                }`}>
                  {f.icon}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                  f.highlight
                    ? "bg-[var(--saffron)] text-white"
                    : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                }`}>
                  {f.badge}
                </span>
              </div>
              <h3 className="font-bold text-[var(--foreground)] mb-2">{f.title}</h3>
              <p className="text-sm text-[var(--muted-foreground)] leading-relaxed mb-4">{f.description}</p>
              <span className={`text-sm font-semibold ${f.highlight ? "text-[var(--saffron-hover)]" : "text-[var(--primary)]"} group-hover:underline`}>
                {f.cta}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="bg-[var(--muted)] border-t border-[var(--card-border)]">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">How the Research Q&A works</h2>
            <p className="text-sm text-[var(--muted-foreground)]">Your question → real science → cited answer</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="relative">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden sm:block absolute top-6 left-[calc(100%-0.5rem)] w-[calc(100%-2.5rem)] h-px bg-[var(--card-border)] -z-10" />
                )}
                <div className="bg-white rounded-2xl border border-[var(--card-border)] p-5 shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-sm font-bold mb-4">
                    {step.step}
                  </div>
                  <h3 className="font-semibold text-[var(--foreground)] mb-2 text-sm">{step.title}</h3>
                  <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA footer ── */}
      <section className="bg-[var(--primary)] text-white">
        <div className="max-w-3xl mx-auto px-6 py-14 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to understand your health?</h2>
          <p className="text-indigo-200 text-sm mb-8 leading-relaxed">
            Start with a question, check your risk profile, or browse the conditions library.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/chat" className="px-6 py-3 rounded-xl bg-white text-[var(--primary)] font-semibold text-sm hover:bg-indigo-50 transition-colors shadow">
              Start Asking →
            </Link>
            <Link href="/assess" className="px-6 py-3 rounded-xl bg-[var(--saffron)] text-white font-semibold text-sm hover:bg-[var(--saffron-hover)] transition-colors shadow">
              Check My Risk →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
