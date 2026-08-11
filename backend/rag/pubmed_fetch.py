"""
Lightweight PubMed/Entrez fetch helper.

Kept in its own module so it can be imported quickly (no chromadb, voyageai,
pymupdf, etc.) both by the batch ingest pipeline (rag/ingest.py) and by the
live-search MCP server (mcp_pubmed_server.py), which runs as a subprocess and
needs a fast startup time.
"""
from __future__ import annotations

import os
from typing import Optional

from Bio import Entrez

HIGH_EVIDENCE_PUB_TYPES = {
    "Meta-Analysis",
    "Systematic Review",
    "Practice Guideline",
    "Guideline",
    "Consensus Development Conference",
    "Consensus Development Conference, NIH",
    "Review",
}


def classify_evidence(pub_types: list[str]) -> str:
    """Classify a paper's evidence strength based on publication types."""
    pt_set = set(pub_types)
    if pt_set & {"Meta-Analysis", "Systematic Review"}:
        return "meta_analysis"
    if pt_set & {"Practice Guideline", "Guideline", "Consensus Development Conference",
                 "Consensus Development Conference, NIH"}:
        return "guideline"
    if "Randomized Controlled Trial" in pt_set:
        return "rct"
    if "Review" in pt_set:
        return "review"
    return "primary"


def fetch_pubmed_single_query(
    query: str,
    email: str,
    max_results: int = 10,
    high_evidence_only: bool = False,
    min_date: Optional[str] = None,
) -> list[dict]:
    """Fetch PubMed papers for a single query string.

    Shared between the batch ingestion pipeline (rag/ingest.py) and the live
    per-query fallback used by the chat endpoint (via mcp_pubmed_server.py).

    Args:
        query: Raw search string or PubMed query expression.
        email: Required by NCBI Entrez — identifies the caller.
        max_results: Maximum number of results to return.
        high_evidence_only: When True, restrict to meta-analyses, systematic
            reviews, and guidelines via publication-type filter.
        min_date: Only include papers published on or after this date.
            Format: YYYY/MM/DD — used for incremental runs.

    Returns:
        List of paper dicts: {pmid, title, abstract, authors, year, source,
        doi, evidence_level, pub_types}. Skips papers with no abstract.
    """
    if not email:
        email = os.getenv("ENTREZ_EMAIL", "")
    Entrez.email = email
    papers = []

    try:
        if high_evidence_only:
            search_term = (
                f'({query}) AND ("meta-analysis"[pt] OR "systematic review"[pt] '
                f'OR "practice guideline"[pt] OR "guideline"[pt])'
            )
        else:
            search_term = query

        search_kwargs: dict = {
            "db": "pubmed",
            "term": search_term,
            "retmax": max_results,
            "sort": "relevance",
        }
        if min_date:
            search_kwargs["mindate"] = min_date
            search_kwargs["datetype"] = "pdat"

        handle = Entrez.esearch(**search_kwargs)
        record = Entrez.read(handle)
        handle.close()
        pmids = record.get("IdList", [])

        if not pmids:
            return papers

        fetch_handle = Entrez.efetch(
            db="pubmed", id=",".join(pmids), rettype="xml", retmode="xml"
        )
        fetch_record = Entrez.read(fetch_handle)
        fetch_handle.close()

        for article in fetch_record.get("PubmedArticle", []):
            try:
                medline = article["MedlineCitation"]
                art = medline["Article"]

                title = str(art.get("ArticleTitle", ""))
                abstract_list = art.get("Abstract", {}).get("AbstractText", [])
                if isinstance(abstract_list, list):
                    abstract = " ".join(str(a) for a in abstract_list)
                else:
                    abstract = str(abstract_list)

                if not abstract.strip():
                    continue

                pmid = str(medline["PMID"])
                pub_date = art.get("Journal", {}).get("JournalIssue", {}).get("PubDate", {})
                year = str(pub_date.get("Year", pub_date.get("MedlineDate", "")[:4]))

                pub_types = [str(pt) for pt in art.get("PublicationTypeList", [])]
                evidence_level = classify_evidence(pub_types)

                authors_list = art.get("AuthorList", [])
                authors = []
                for a in authors_list[:3]:
                    last = a.get("LastName", "")
                    fore = a.get("ForeName", "")
                    if last:
                        authors.append(f"{last} {fore}".strip())
                if len(art.get("AuthorList", [])) > 3:
                    authors.append("et al.")

                doi = ""
                for art_id in article.get("PubmedData", {}).get("ArticleIdList", []):
                    try:
                        if art_id.attributes.get("IdType") == "doi":
                            doi = str(art_id).strip()
                            break
                    except AttributeError:
                        pass
                if not doi:
                    for loc in art.get("ELocationID", []):
                        try:
                            if loc.attributes.get("EIdType") == "doi":
                                doi = str(loc).strip()
                                break
                        except AttributeError:
                            pass

                papers.append({
                    "pmid": pmid,
                    "title": title,
                    "abstract": abstract,
                    "authors": ", ".join(authors),
                    "year": year,
                    "source": "PubMed",
                    "doi": doi,
                    "evidence_level": evidence_level,
                    "pub_types": ", ".join(pub_types),
                })
            except Exception:
                continue

    except Exception as e:
        print(f"PubMed query failed for '{query}': {e}")

    return papers
