"""
MCP server — South Asian Health literature retrieval tool.

Exposes the full hybrid retrieval pipeline (query expansion + HyDE + Voyage dense
search + BM25 + FlashRank reranking + evidence boosting) as a single MCP tool that
any MCP client can call. The calling model does the synthesis; this server only
retrieves and cites.

Run:
    python backend/mcp_server.py           # stdio transport (used by Claude Desktop)
    mcp dev backend/mcp_server.py          # MCP Inspector — interactive browser UI
"""
from __future__ import annotations

import os
import sys

# Put the backend package root on sys.path so "from rag.retrieval import …" works
# regardless of where the MCP client launches this script from.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mcp.server.mcpserver import MCPServer

from rag.retrieval import format_context, retrieve

mcp = MCPServer(
    name="south-asian-health",
    instructions=(
        "This server gives you direct access to a curated corpus of peer-reviewed "
        "research on South Asian cardiometabolic health (~43 000 indexed paper chunks). "
        "Call search_south_asian_health_literature before answering any question about "
        "diabetes, cardiovascular disease, hypertension, metabolic syndrome, obesity, "
        "or related conditions specifically in South Asian populations. "
        "The tool returns verbatim evidence passages with full citations so you can "
        "ground your answer in the literature rather than parametric memory."
    ),
)


def _chroma_path() -> str:
    """Resolve ChromaDB path — same logic as routes/chat.py get_chroma_path()."""
    return os.getenv(
        "CHROMA_DB_PATH",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "chroma_db"),
    )


@mcp.tool()
def search_south_asian_health_literature(query: str, top_k: int = 8) -> dict:
    """Search the South Asian cardiometabolic health literature corpus and return cited evidence.

    Use this tool for any question about health risks, conditions, or interventions
    specifically studied in South Asian populations, including:
      - Type 2 diabetes and insulin resistance in South Asians
      - Cardiovascular disease, hypertension, and stroke risk
      - Metabolic syndrome, visceral adiposity, and BMI thresholds
      - PCOS, gestational diabetes, chronic kidney disease, NAFLD
      - Dietary patterns, physical activity, and pharmacological management
      - Genetic risk factors and South Asian-specific clinical thresholds
      - Vitamin D deficiency, thalassemia, tuberculosis in South Asian cohorts

    The pipeline runs: query expansion → HyDE hypothetical document → Voyage AI dense
    search across raw papers + synthesized wiki pages → BM25 keyword search →
    Reciprocal Rank Fusion → FlashRank cross-encoder reranking → evidence-level boosting.

    NOT for: general (non-South-Asian-specific) medicine, drug prescribing advice,
    diagnosis, or topics outside cardiometabolic/metabolic medicine.

    Args:
        query: A specific health question or search topic. Mention the condition or
               intervention and ideally the South Asian population context if not
               already implicit (e.g. "type 2 diabetes prevalence South Asian").
        top_k: Number of evidence passages to return. Default 8 covers most questions;
               raise to 12–15 for complex multi-condition questions.

    Returns:
        A dict with three keys:
          "evidence"       — formatted context string; each passage is prefixed with a
                             reference number and its evidence type (Guideline, RCT, etc.)
                             for use verbatim in your answer.
          "citations"      — list of dicts: {ref, title, authors, year, doi, source,
                             evidence_level, evidence_label}. Cite these inline.
          "low_confidence" — bool. True when the corpus top-match score is below 0.35,
                             meaning coverage of this specific question is sparse — caveat
                             your answer accordingly and do not fabricate missing evidence.
    """
    hits, info = retrieve(query=query, chroma_db_path=_chroma_path(), top_k=top_k)
    evidence, citations = format_context(hits)
    return {
        "evidence": evidence,
        "citations": citations,
        "low_confidence": bool(info.get("low_confidence", False)),
    }


if __name__ == "__main__":
    mcp.run()
