"use client";

import { useState } from "react";
import type { Citation } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CitationPanelProps {
  citations: Citation[];
}

interface FigureItem {
  filename: string;
  url: string;
}

const SOURCE_STYLES: Record<string, string> = {
  PubMed: "bg-blue-50 text-blue-700 border-blue-200",
  "Clinical Guideline": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "PMC Full Text": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Unpaywall PDF": "bg-violet-50 text-violet-700 border-violet-200",
  "OpenAlex": "bg-orange-50 text-orange-700 border-orange-200",
  "Knowledge Base": "bg-teal-50 text-teal-700 border-teal-200",
};

const EVIDENCE_STYLES: Record<string, string> = {
  guideline: "bg-emerald-100 text-emerald-800",
  meta_analysis: "bg-amber-100 text-amber-800",
  rct: "bg-sky-100 text-sky-800",
  knowledge_base: "bg-teal-100 text-teal-800",
};

// Relative URLs — routed through Next.js rewrite proxy to avoid CORS issues.
const API_BASE = "";

function FiguresSection({ figuresDir }: { figuresDir: string }) {
  const [figures, setFigures] = useState<FigureItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function loadFigures() {
    if (figures !== null) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/figures/${figuresDir}`);
      const data = await res.json();
      setFigures(data.figures ?? []);
      setExpanded(true);
    } catch {
      setFigures([]);
    } finally {
      setLoading(false);
    }
  }

  const hasFigures = figures !== null && figures.length > 0;

  return (
    <div className="mt-2">
      <button
        onClick={loadFigures}
        className="flex items-center gap-1 text-[10px] text-[var(--primary)] hover:underline font-medium"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        {loading ? "Loading figures…" : figures === null ? "Show figures" : expanded ? "Hide figures" : `${figures.length} figure${figures.length !== 1 ? "s" : ""}`}
      </button>

      {expanded && hasFigures && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {figures.map((fig) => (
            <a
              key={fig.filename}
              href={`${API_BASE}${fig.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg overflow-hidden border border-[var(--card-border)] hover:border-[var(--primary)] transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${API_BASE}${fig.url}`}
                alt={fig.filename}
                className="w-full h-28 object-contain bg-white"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}

      {expanded && figures !== null && figures.length === 0 && (
        <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">No figures available.</p>
      )}
    </div>
  );
}

export function CitationPanel({ citations }: CitationPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-4 border-t border-[var(--card-border)] pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-semibold text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors mb-0"
      >
        <span className="w-5 h-5 rounded-md bg-[var(--sidebar-active)] border border-[var(--sidebar-active-border)] flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {citations.length} research source{citations.length !== 1 ? "s" : ""}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          className={cn("w-3 h-3 transition-transform", expanded ? "rotate-180" : "")}
        >
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {citations.map((c) => (
            <div
              key={c.ref}
              className="rounded-xl border border-[var(--card-border)] bg-[var(--muted)] p-3"
            >
              <div className="flex items-start gap-2.5">
                {/* Ref number */}
                <span className="w-5 h-5 rounded-full bg-[var(--primary)] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {c.ref}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--foreground)] leading-snug mb-1">
                    {c.title}
                  </p>

                  {c.authors && (
                    <p className="text-[11px] text-[var(--muted-foreground)] mb-1.5 truncate">
                      {c.authors}{c.year ? ` · ${c.year}` : ""}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Source badge */}
                    <span className={cn(
                      "inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium",
                      SOURCE_STYLES[c.source] ?? "bg-purple-50 text-purple-700 border-purple-200"
                    )}>
                      {c.source}
                    </span>

                    {/* Evidence level badge */}
                    {c.evidence_label && c.evidence_level !== "primary" && (
                      <span className={cn(
                        "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold",
                        EVIDENCE_STYLES[c.evidence_level ?? ""] ?? "bg-gray-100 text-gray-700"
                      )}>
                        {c.evidence_label}
                      </span>
                    )}

                    {/* DOI link */}
                    {c.doi && (
                      <a
                        href={`https://doi.org/${c.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-[10px] text-[var(--primary)] hover:underline font-medium"
                      >
                        View paper
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-2.5 h-2.5">
                          <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </a>
                    )}
                  </div>

                  {/* Figures section — only shown when figures were extracted */}
                  {c.has_figures && c.figures_dir && (
                    <FiguresSection figuresDir={c.figures_dir} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
