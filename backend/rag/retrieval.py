"""
Hybrid retrieval: dense ChromaDB vector search + BM25 keyword search,
combined with FlashRank cross-encoder reranking. Uses local
sentence-transformers (PubMedBERT) for embeddings.

Adds three medical-specific upgrades beyond plain hybrid retrieval:
1. LLM-based query expansion — rewrites the question into 2-3 medical-
   terminology variants so retrieval catches papers that use different
   wording (e.g. "sugar problem" -> "hyperglycemia", "type 2 diabetes").
2. Evidence-aware boosting — chunks tagged as clinical guidelines,
   meta-analyses, or systematic reviews get a score bonus at rerank time.
3. Confidence signaling — exposes the top reranker score so the chat
   layer can warn the LLM when evidence is weak and avoid hallucination.
"""
from __future__ import annotations

import os
from typing import Optional

import chromadb
from flashrank import Ranker, RerankRequest
from groq import Groq
from rank_bm25 import BM25Okapi

from .ingest import COLLECTION_NAME, embed_query, get_chroma_client, get_collection

RANKER = None

# Score multipliers applied on top of the reranker score.
# Guidelines are treated as near-authoritative; meta-analyses are gold
# standard research evidence; primary studies get no boost.
EVIDENCE_BOOSTS = {
    "guideline": 1.50,
    "meta_analysis": 1.35,
    "rct": 1.15,
    "review": 1.10,
    "primary": 1.00,
}

# Threshold for "low confidence" retrieval. Calibrated for FlashRank
# ms-marco-MiniLM-L-12-v2 which typically returns sigmoid-like scores.
LOW_CONFIDENCE_THRESHOLD = 0.35


def _get_ranker() -> Ranker:
    global RANKER
    if RANKER is None:
        # Use a persistent directory inside the backend folder so the model
        # survives server restarts (avoid /tmp which is cleared on reboot).
        cache_dir = os.path.join(os.path.dirname(__file__), "..", ".flashrank_cache")
        cache_dir = os.path.abspath(cache_dir)
        os.makedirs(cache_dir, exist_ok=True)
        RANKER = Ranker(model_name="ms-marco-MiniLM-L-12-v2", cache_dir=cache_dir)
    return RANKER


def expand_query(query: str, groq_client: Optional[Groq] = None) -> list[str]:
    """Use Groq LLM to rewrite the user question into 2-3 medical-terminology
    variants. Falls back to just the original query if the LLM call fails
    (so retrieval still works without Groq access)."""
    if groq_client is None:
        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key:
            return [query]
        try:
            groq_client = Groq(api_key=api_key)
        except Exception:
            return [query]

    prompt = f"""Rewrite the following health question into 3 short search queries using precise medical terminology. Focus on South Asian population health where relevant.

Return ONLY the 3 queries, one per line, no numbering, no explanation.

Question: {query}"""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=200,
        )
        text = response.choices[0].message.content or ""
        variants = [line.strip() for line in text.strip().split("\n") if line.strip()]
        variants = [v for v in variants if 3 < len(v) < 200][:3]

        all_queries = [query] + variants
        seen = set()
        unique = []
        for q in all_queries:
            key = q.lower().strip()
            if key not in seen:
                seen.add(key)
                unique.append(q)
        return unique
    except Exception as e:
        print(f"Query expansion failed: {e}")
        return [query]


def dense_search(
    query_embedding: list[float],
    collection: chromadb.Collection,
    top_k: int = 20,
) -> list[dict]:
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, collection.count() or 1),
        include=["documents", "metadatas", "distances"],
    )
    hits = []
    docs = results["documents"][0]
    metas = results["metadatas"][0]
    dists = results["distances"][0]
    for doc, meta, dist in zip(docs, metas, dists):
        hits.append({
            "text": doc,
            "meta": meta,
            "score": 1 - dist,
        })
    return hits


def bm25_search(
    query: str,
    all_docs: list[dict],
    top_k: int = 20,
) -> list[dict]:
    if not all_docs:
        return []
    tokenized_corpus = [d["text"].lower().split() for d in all_docs]
    bm25 = BM25Okapi(tokenized_corpus)
    tokenized_query = query.lower().split()
    scores = bm25.get_scores(tokenized_query)
    ranked_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    hits = []
    for i in ranked_indices[:top_k]:
        if scores[i] > 0:
            hits.append({
                "text": all_docs[i]["text"],
                "meta": all_docs[i]["meta"],
                "score": float(scores[i]),
            })
    return hits


def merge_hits(*hit_lists: list[dict]) -> list[dict]:
    """Merge multiple ranked lists using Reciprocal Rank Fusion."""
    scores: dict[str, float] = {}
    docs_map: dict[str, dict] = {}

    for hits in hit_lists:
        for rank, hit in enumerate(hits):
            key = hit["text"][:100]
            scores[key] = scores.get(key, 0) + 1 / (rank + 60)
            docs_map[key] = hit

    merged = sorted(docs_map.values(), key=lambda h: scores[h["text"][:100]], reverse=True)
    return merged


def _apply_evidence_boost(hit: dict) -> dict:
    """Multiply a hit's score by its evidence-level boost factor."""
    level = hit.get("meta", {}).get("evidence_level", "primary")
    boost = EVIDENCE_BOOSTS.get(level, 1.0)
    hit = {**hit, "score": hit["score"] * boost, "boost_applied": boost}
    return hit


def rerank(query: str, hits: list[dict], top_k: int = 10) -> list[dict]:
    if not hits:
        return []
    ranker = _get_ranker()
    passages = [{"id": i, "text": h["text"], "meta": h["meta"]} for i, h in enumerate(hits)]
    request = RerankRequest(query=query, passages=passages)
    results = ranker.rerank(request)

    scored = []
    for r in results:
        original = hits[r["id"]]
        scored.append({
            "text": original["text"],
            "meta": original["meta"],
            "score": float(r.get("score", 0)),
        })

    boosted = [_apply_evidence_boost(h) for h in scored]
    boosted.sort(key=lambda h: h["score"], reverse=True)
    return boosted[:top_k]


def retrieve(
    query: str,
    chroma_db_path: str,
    top_k: int = 10,
    use_query_expansion: bool = True,
) -> tuple[list[dict], dict]:
    """
    Full medical-grade hybrid retrieval pipeline:
    1. Expand the user question into 2-3 medical-terminology variants (Groq LLM)
    2. Dense vector search for each variant (PubMedBERT + ChromaDB)
    3. BM25 keyword search over the combined dense candidates
    4. Reciprocal Rank Fusion merge across all query variants + BM25
    5. Cross-encoder reranking (FlashRank)
    6. Evidence-level boosting (guidelines > meta-analyses > RCTs > primary)

    Returns `(hits, retrieval_info)` where `retrieval_info` includes the
    top score, whether confidence is low, and the expanded queries used.
    """
    client = get_chroma_client(chroma_db_path)
    collection = get_collection(client)

    info: dict = {
        "expanded_queries": [query],
        "top_score": 0.0,
        "low_confidence": True,
        "num_candidates": 0,
    }

    if collection.count() == 0:
        return [], info

    queries = expand_query(query) if use_query_expansion else [query]
    info["expanded_queries"] = queries

    # Dense search for each query variant
    all_dense: list[list[dict]] = []
    for q in queries:
        emb = embed_query(q)
        all_dense.append(dense_search(emb, collection, top_k=40))

    # Flatten dense hits (dedup by text key) for BM25 input
    seen_keys: set[str] = set()
    combined_dense: list[dict] = []
    for hits in all_dense:
        for h in hits:
            key = h["text"][:100]
            if key not in seen_keys:
                seen_keys.add(key)
                combined_dense.append(h)

    bm25_hits = bm25_search(query, combined_dense, top_k=30)
    merged = merge_hits(*all_dense, bm25_hits)

    info["num_candidates"] = len(merged)

    reranked = rerank(query, merged[:60], top_k=top_k)

    if reranked:
        # Top pre-boost score (reranker output) — indicates true relevance.
        # Using first hit's score after division by the boost applied.
        raw_top = reranked[0]["score"] / reranked[0].get("boost_applied", 1.0)
        info["top_score"] = raw_top
        info["low_confidence"] = raw_top < LOW_CONFIDENCE_THRESHOLD

    return reranked, info


def format_context(hits: list[dict]) -> tuple[str, list[dict]]:
    """Format retrieved chunks as context string and return citation list.
    Evidence level is surfaced into both the LLM context and citations so
    the model can weigh sources and the UI can label them."""
    context_parts = []
    citations = []

    for i, hit in enumerate(hits):
        meta = hit["meta"]
        ref_num = i + 1
        title = meta.get("title", "Unknown")
        authors = meta.get("authors", "")
        year = meta.get("year", "")
        doi = meta.get("doi", "")
        source = meta.get("source", "")
        evidence_level = meta.get("evidence_level", "primary")

        evidence_label_map = {
            "guideline": "Clinical Guideline",
            "meta_analysis": "Meta-Analysis / Systematic Review",
            "rct": "Randomized Controlled Trial",
            "review": "Review",
            "primary": "Primary Study",
        }
        evidence_label = evidence_label_map.get(evidence_level, "Primary Study")

        context_parts.append(
            f"[{ref_num}] ({evidence_label}) {hit['text']}"
        )
        citations.append({
            "ref": ref_num,
            "title": title,
            "authors": authors,
            "year": year,
            "doi": doi,
            "source": source,
            "evidence_level": evidence_level,
            "evidence_label": evidence_label,
        })

    return "\n\n".join(context_parts), citations
