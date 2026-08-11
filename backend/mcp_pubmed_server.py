"""
MCP server — Live PubMed search tool.

Provides a single tool: live_pubmed_search(query, max_results) that fetches
fresh results from NCBI PubMed and returns paper metadata (title, abstract,
authors, year, PMID, DOI, evidence level).

Two use cases:
1. Called by the chat endpoint as an MCP client when local corpus retrieval
   returns low confidence — see routes/chat.py _call_pubmed_mcp().
2. Available standalone from Claude Desktop / Claude Code for ad-hoc literature
   queries against live PubMed.

Imports only rag.pubmed_fetch (Bio.Entrez + stdlib), not the full rag.ingest,
so subprocess startup is fast even though the repo has heavy optional deps.

Run:
    python backend/mcp_pubmed_server.py          # stdio transport (MCP clients)
    mcp dev backend/mcp_pubmed_server.py          # MCP Inspector browser UI
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mcp.server.mcpserver import MCPServer

from rag.pubmed_fetch import fetch_pubmed_single_query

mcp = MCPServer(
    name="pubmed-live-search",
    instructions=(
        "Fetches live, up-to-date results from NCBI PubMed. "
        "Use when a local corpus returns low-confidence results or when you need "
        "recent publications not yet in the indexed corpus. "
        "Results are unreviewed — cite them clearly and weight them below "
        "pre-vetted corpus sources."
    ),
)


@mcp.tool()
def live_pubmed_search(query: str, max_results: int = 5) -> list[dict]:
    """Search PubMed live and return paper metadata including abstracts.

    Fetches current results directly from NCBI PubMed via Entrez. Results may
    be more recent than a locally indexed corpus but are unreviewed — treat
    them with appropriate caution and explicitly label them as live-fetched.

    Use for:
    - Queries where the local corpus returns low confidence (top rerank < 0.35)
    - Specific or recent publications not in the corpus
    - Validating a claim against the broader literature

    Args:
        query: PubMed-compatible search string. Medical MeSH terms and Boolean
               operators (AND, OR, NOT) are supported. For South Asian health
               queries, include population terms like "South Asian", "Indian",
               "Pakistani", etc. for better precision.
               Examples:
                 "South Asian type 2 diabetes prevalence"
                 "visceral adiposity insulin resistance South Asian"
        max_results: Papers to return (default 5, capped at 20). Raise for
                     broad topic surveys; keep at 3-5 for targeted lookups.

    Returns:
        List of dicts with keys: title, abstract, authors, year, pmid, doi,
        evidence_level (primary / rct / meta_analysis / guideline / review).
        Returns an empty list on API failure or no results.
    """
    email = os.getenv("ENTREZ_EMAIL", "")
    if not email:
        return []

    max_results = min(max(1, max_results), 20)
    papers = fetch_pubmed_single_query(query, email, max_results=max_results)

    return [
        {
            "title": p["title"],
            "abstract": p["abstract"],
            "authors": p["authors"],
            "year": p["year"],
            "pmid": p["pmid"],
            "doi": p["doi"],
            "evidence_level": p["evidence_level"],
        }
        for p in papers
    ]


if __name__ == "__main__":
    mcp.run()
