#!/usr/bin/env python3
"""
Auto-ingestion script for the South Asian Health RAG platform.

Designed to run as a weekly cron job. Fetches only papers published in the
last N days (default: 8 days, to give a 1-day overlap with the previous run)
and adds new chunks to the existing ChromaDB collection without resetting it.

Optionally rebuilds the knowledge base after ingestion so that wiki pages
reflect any new papers that were added.

Usage (from the backend/ directory):
    python scripts/auto_ingest.py                     # last 8 days
    python scripts/auto_ingest.py --days-back 30      # last 30 days
    python scripts/auto_ingest.py --rebuild-kb        # also rebuild wiki pages
    python scripts/auto_ingest.py --full-reset        # full re-ingest (wipes DB)

Cron example (runs every Sunday at 2am):
    0 2 * * 0 cd /path/to/backend && /path/to/venv/bin/python scripts/auto_ingest.py --rebuild-kb >> /var/log/south_asian_health_ingest.log 2>&1
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Path setup ────────────────────────────────────────────────────────────────
# Allow running from any CWD by adding backend/ to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(dotenv_path=BACKEND_DIR / ".env")

from rag.ingest import run_full_ingestion


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Incremental auto-ingestion for South Asian Health RAG"
    )
    parser.add_argument(
        "--days-back",
        type=int,
        default=8,
        help="Fetch papers published in the last N days (default: 8)",
    )
    parser.add_argument(
        "--pubmed-max",
        type=int,
        default=30,
        help="Max papers per query from PubMed (default: 30)",
    )
    parser.add_argument(
        "--openalex-max",
        type=int,
        default=15,
        help="Max papers per query from OpenAlex (default: 15)",
    )
    parser.add_argument(
        "--rebuild-kb",
        action="store_true",
        help="Rebuild knowledge base wiki pages after ingestion",
    )
    parser.add_argument(
        "--full-reset",
        action="store_true",
        help="Full re-ingest: reset the collection and process all queries (no date filter)",
    )
    parser.add_argument(
        "--no-unpaywall",
        action="store_true",
        help="Skip Unpaywall full-text enrichment",
    )
    return parser.parse_args()


def make_min_date(days_back: int) -> str:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)
    return cutoff.strftime("%Y/%m/%d")


def main() -> None:
    args = parse_args()

    # ── Resolve config from environment ──────────────────────────────────────
    entrez_email = os.getenv("ENTREZ_EMAIL", "")
    chroma_path = os.getenv("CHROMA_DB_PATH", "../data/chroma_db")
    guidelines_path = os.getenv("GUIDELINES_DIR", "../data/guidelines")
    figures_dir = os.getenv("FIGURES_DIR", "../data/figures")
    kb_dir = os.getenv("KNOWLEDGE_BASE_PATH", "../data/knowledge_base")

    if not entrez_email:
        print("ERROR: ENTREZ_EMAIL is not set. Add it to backend/.env", file=sys.stderr)
        sys.exit(1)

    # ── Resolve paths relative to backend/ ────────────────────────────────────
    def resolve(p: str) -> str:
        path = Path(p)
        if not path.is_absolute():
            path = BACKEND_DIR / path
        return str(path)

    chroma_path = resolve(chroma_path)
    guidelines_path = resolve(guidelines_path)
    figures_dir = resolve(figures_dir)
    kb_dir = resolve(kb_dir)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"\n{'='*60}")
    print(f"South Asian Health — Auto-Ingestion")
    print(f"Started: {timestamp}")
    print(f"Mode: {'FULL RESET' if args.full_reset else f'incremental (last {args.days_back} days)'}")
    print(f"{'='*60}\n")

    # ── Ingestion ─────────────────────────────────────────────────────────────
    min_date = None if args.full_reset else make_min_date(args.days_back)

    if min_date:
        print(f"Fetching papers published on or after: {min_date}\n")

    ingest_kwargs: dict = {
        "chroma_db_path": chroma_path,
        "entrez_email": entrez_email,
        "guidelines_path": guidelines_path,
        "figures_dir": figures_dir,
        "unpaywall_enrich": not args.no_unpaywall,
        "reset_collection": args.full_reset,
    }

    if args.full_reset:
        # Full run — use generous limits
        ingest_kwargs.update({
            "pubmed_max": 50,
            "semantic_scholar_max": 20,
            "pmc_max": 20,
            "openalex_max": 20,
            "high_evidence_max": 30,
        })
    else:
        # Incremental — skip slow/unreliable sources, use date filter
        ingest_kwargs.update({
            "pubmed_max": args.pubmed_max,
            "semantic_scholar_max": 0,
            "pmc_max": 0,
            "openalex_max": args.openalex_max,
            "high_evidence_max": 15,
            "min_date": min_date,
        })

    result = run_full_ingestion(**ingest_kwargs)

    print(f"\n{'─'*60}")
    print("Ingestion complete:")
    print(f"  High-evidence papers fetched : {result.get('high_evidence_count', 0)}")
    print(f"  PubMed papers fetched        : {result.get('pubmed_count', 0)}")
    print(f"  OpenAlex papers fetched      : {result.get('openalex_count', 0)}")
    print(f"  Semantic Scholar papers      : {result.get('semantic_scholar_count', 0)}")
    print(f"  PMC full-text papers         : {result.get('pmc_count', 0)}")
    print(f"  Unpaywall full-text upgrades : {result.get('unpaywall_upgraded', 0)}")
    print(f"  Guideline chunks             : {result.get('guideline_chunks', 0)}")
    print(f"  Total new chunks ingested    : {result.get('total_chunks', 0)}")

    if result.get("total_chunks", 0) == 0 and not args.full_reset:
        print("\n  (No new papers found in the date window — this is normal for short windows.)")

    # ── Knowledge base rebuild (optional) ─────────────────────────────────────
    if args.rebuild_kb:
        print(f"\n{'─'*60}")
        print("Rebuilding knowledge base wiki pages...")
        try:
            from rag.knowledge_base import build_knowledge_base

            groq_api_key = os.getenv("GROQ_API_KEY", "")
            if not groq_api_key:
                print("  SKIPPED: GROQ_API_KEY is not set.")
            else:
                kb_result = build_knowledge_base(
                    chroma_db_path=chroma_path,
                    kb_dir_path=kb_dir,
                    groq_api_key=groq_api_key,
                    # For incremental runs, skip existing pages to save tokens.
                    # For full resets, rebuild everything.
                    skip_existing=not args.full_reset,
                )
                print(f"  Pages built   : {kb_result['pages_built']}")
                print(f"  Chunks indexed: {kb_result['chunks_indexed']}")
                if kb_result["errors"]:
                    print(f"  Errors ({len(kb_result['errors'])}):")
                    for err in kb_result["errors"]:
                        print(f"    - {err}")
        except Exception as e:
            print(f"  ERROR during KB build: {e}")

    print(f"\nFinished: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
