"use client";

import Link from "next/link";
import { MandalaPortal } from "@/components/portal/mandala-portal";
import { HeroTypewriter } from "@/components/home/hero-typewriter";

const DESTINATIONS: { href: string; label: string; description: string }[] = [
  {
    href: "/chat",
    label: "Research Q&A",
    description: "Ask health questions and get clear answers with source links you can check.",
  },
  {
    href: "/assess",
    label: "Risk Assessment",
    description: "Coming soon — South Asian-focused risk summary while we finish testing.",
  },
  {
    href: "/simulate",
    label: "Simulator",
    description: "Change habits and vitals to see how your trend lines might change over time.",
  },
  {
    href: "/conditions",
    label: "Conditions",
    description: "Read quick, plain-language overviews of common conditions.",
  },
  {
    href: "/resources",
    label: "Resources",
    description: "Browse trusted articles and links to save and review later.",
  },
];

export function HomeExperience() {
  return (
    <MandalaPortal
      viewport="full"
      regionAriaLabel="Site tools and pages"
      hero={<HeroTypewriter text="South Asian Health" />}
      reveal={
        <section
          id="home-destinations"
          className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-1 flex-col items-stretch justify-start gap-5 px-3 py-5 pt-5 sm:gap-6 sm:px-6 sm:py-7 sm:pt-6"
          aria-labelledby="home-destinations-heading"
        >
          <div className="shrink-0 text-center">
            <h2
              id="home-destinations-heading"
              className="text-balance font-semibold leading-tight tracking-[0.02em] text-[var(--foreground)] [font-family:var(--font-fraunces),Georgia,serif] text-base sm:text-lg"
            >
              Choose A Tool
            </h2>
          </div>
          {/*
            Layout: 3 cards on the first row, 2 centered on the second (sm+).
            Mobile: 2 columns; last card spans 2 and stays readable.
          */}
          <ul
            className="grid min-h-0 w-full flex-1 list-none grid-cols-2 gap-3 sm:max-w-none sm:grid-cols-6 sm:gap-4 sm:justify-self-center"
            role="list"
          >
            {DESTINATIONS.map((d, i) => {
              const isFirstRow = i < 3;
              const isSecondRowPair = i >= 3;
              return (
                <li
                  key={d.href}
                  className={[
                    "min-h-0 flex min-w-0",
                    "max-sm:last:col-span-2 max-sm:last:flex max-sm:last:justify-center",
                    isFirstRow ? "sm:col-span-2" : "",
                    isSecondRowPair && i === 3 ? "sm:col-span-2 sm:col-start-2" : "",
                    isSecondRowPair && i === 4 ? "sm:col-span-2 sm:col-start-4" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Link
                    href={d.href}
                    prefetch
                    className="group box-border flex h-full min-h-[5.25rem] w-full max-w-sm flex-col items-center justify-between rounded-lg border border-[var(--card-border)]/90 bg-gradient-to-b from-white/95 to-white/85 px-3 py-3 text-center shadow-sm backdrop-blur-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] sm:min-h-[6.75rem] sm:max-w-none sm:px-4 sm:py-4"
                  >
                    <span className="font-display line-clamp-2 w-full text-[0.78rem] font-semibold leading-snug text-[var(--foreground)] group-hover:text-[var(--primary)] sm:text-[0.85rem]">
                      {d.label}
                    </span>
                    <span className="mt-2 line-clamp-3 w-full text-[0.68rem] leading-relaxed text-[var(--foreground)]/80 sm:line-clamp-4 sm:text-[0.74rem]">
                      {d.description}
                    </span>
                    <span className="mt-3 text-[0.62rem] font-medium tracking-wide text-[var(--primary)] opacity-90 sm:text-[0.68rem] group-hover:underline">
                      Continue
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      }
    />
  );
}
