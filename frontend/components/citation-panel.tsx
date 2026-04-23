"use client";

import { useState } from "react";
import type { Citation } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CitationPanelProps {
  citations: Citation[];
}

const SOURCE_STYLES: Record<string, string> = {
  PubMed: "bg-blue-50 text-blue-700 border-blue-200",
  "Clinical Guideline": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "PMC Full Text": "bg-indigo-50 text-indigo-700 border-indigo-200",
};

const EVIDENCE_STYLES: Record<string, string> = {
  guideline: "bg-emerald-100 text-emerald-800",
  meta_analysis: "bg-amber-100 text-amber-800",
  rct: "bg-sky-100 text-sky-800",
};

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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
