"""
Hybrid retrieval: dense Voyage AI vector search + BM25 keyword search,
combined with FlashRank cross-encoder reranking.

Retrieval pipeline:
1. Query expansion — rewrites the question into 3 medical-terminology variants
   using Groq LLM, with explicit South Asian population framing.
2. HyDE (Hypothetical Document Embeddings) — generates a short hypothetical
   answer paragraph and embeds it. This often retrieves better results than
   the question itself because the embedding space is document-oriented.
3. Dense vector search — Voyage AI voyage-medical-2 embeddings, ChromaDB cosine
   search across raw papers + knowledge base collections.
4. BM25 keyword search — ensures exact medical term matches aren't missed.
5. Reciprocal Rank Fusion — merges all ranked lists.
6. Cross-encoder reranking — FlashRank ms-marco-MiniLM-L-12-v2.
7. Evidence-aware boosting — guidelines, meta-analyses, and KB pages boosted.
8. Confidence signaling — exposes top score to warn against hallucination.
"""
from __future__ import annotations

import os
from typing import Optional

import chromadb
from flashrank import Ranker, RerankRequest
from groq import Groq
from rank_bm25 import BM25Okapi

from .ingest import COLLECTION_NAME, embed_query, get_chroma_client, get_collection

KB_COLLECTION_NAME = "south_asian_kb"

RANKER = None

# Score multipliers applied on top of the reranker score.
EVIDENCE_BOOSTS = {
    "guideline": 1.50,
    "meta_analysis": 1.35,
    "rct": 1.15,
    "review": 1.10,
    "knowledge_base": 1.40,  # pre-synthesized wiki pages are high-quality
    "primary": 1.00,
}

LOW_CONFIDENCE_THRESHOLD = 0.35


def _get_ranker() -> Ranker:
    global RANKER
    if RANKER is None:
        cache_dir = os.path.join(os.path.dirname(__file__), "..", ".flashrank_cache")
        cache_dir = os.path.abspath(cache_dir)
        os.makedirs(cache_dir, exist_ok=True)
        RANKER = Ranker(model_name="ms-marco-MiniLM-L-12-v2", cache_dir=cache_dir)
    return RANKER


def expand_query(query: str, groq_client: Optional[Groq] = None) -> list[str]:
    """Rewrite the user question into 3 medical-terminology search variants.

    Explicitly targets South Asian population-specific terminology and clinical
    synonym variants to maximize recall over the medical corpus.
    Falls back to the original query if the LLM call fails.
    """
    if groq_client is None:
        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key:
            return [query]
        try:
            groq_client = Groq(api_key=api_key)
        except Exception:
            return [query]

    prompt = f"""You are a medical literature search specialist for South Asian health research.

Rewrite the following health question into exactly 3 short search queries optimized for PubMed and medical literature retrieval. Requirements:
- Use precise clinical and epidemiological terminology
- At least one variant should include "South Asian" or a specific South Asian subgroup (Indian, Pakistani, Bangladeshi, etc.) if not already present
- Include synonym variants (e.g. "T2DM" and "type 2 diabetes mellitus", "myocardial infarction" and "heart attack")
- Each query should be 5–12 words
- Return ONLY the 3 queries, one per line, no numbering, no explanation

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


def generate_hyde_document(query: str, groq_client: Optional[Groq] = None) -> Optional[str]:
    """Generate a Hypothetical Document Embedding (HyDE) passage.

    Creates a short paragraph that a South Asian health research paper *might*
    contain to answer the query. Embedding this hypothetical passage often
    retrieves better results than embedding the question itself, because the
    embedding space is oriented toward documents, not questions.

    Returns None on failure so callers can skip gracefully.
    """
    if groq_client is None:
        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key:
            return None
        try:
            groq_client = Groq(api_key=api_key)
        except Exception:
            return None

    prompt = f"""Write a short factual paragraph (3–5 sentences) as if it were an excerpt from a peer-reviewed research paper on South Asian health. The paragraph should contain information that would directly answer the following question. Use precise medical terminology, include plausible numerical values, and write in an academic style.

Question: {query}

Paragraph:"""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=250,
        )
        text = (response.choices[0].message.content or "").strip()
        return text if len(text) > 50 else None
    except Exception as e:
        print(f"HyDE generation failed: {e}")
        return None


def dense_search(
    query_embedding: list[float],
    collection: chromadb.Collection,
    top_k: int = 20,
    source_label: str = "",
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
        hit = {
            "text": doc,
            "meta": meta,
            "score": 1 - dist,
        }
        if source_label:
            hit["collection"] = source_label
        hits.append(hit)
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
    """Merge multiple ranked lists using Reciprocal Rank Fusion (k=60)."""
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
    """Multiply a hit's score by its evidence-level boost factor.
    Knowledge base pages get their own boost since they're pre-synthesized."""
    meta = hit.get("meta", {})
    # Knowledge base pages are tagged by their collection
    if hit.get("collection") == "kb" or meta.get("source") == "Knowledge Base":
        boost = EVIDENCE_BOOSTS["knowledge_base"]
    else:
        level = meta.get("evidence_level", "primary")
        boost = EVIDENCE_BOOSTS.get(level, 1.0)
    return {**hit, "score": hit["score"] * boost, "boost_applied": boost}


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
            "collection": original.get("collection", "papers"),
        })

    boosted = [_apply_evidence_boost(h) for h in scored]
    boosted.sort(key=lambda h: h["score"], reverse=True)
    return boosted[:top_k]


def retrieve(
    query: str,
    chroma_db_path: str,
    top_k: int = 10,
    use_query_expansion: bool = True,
    use_hyde: bool = True,
) -> tuple[list[dict], dict]:
    """
    Full hybrid retrieval pipeline:
    1. Expand query into 3 medical-terminology variants (Groq LLM)
    2. Generate HyDE hypothetical document (Groq LLM)
    3. Dense vector search for each variant + HyDE (Voyage AI + ChromaDB)
       across both raw papers and knowledge base collections
    4. BM25 keyword search over combined dense candidates
    5. Reciprocal Rank Fusion merge
    6. Cross-encoder reranking (FlashRank)
    7. Evidence-level + knowledge-base boosting

    Returns (hits, retrieval_info).
    """
    client = get_chroma_client(chroma_db_path)
    collection = get_collection(client, COLLECTION_NAME)

    # Knowledge base collection — may not exist yet (built separately)
    kb_collection = None
    try:
        kb_collection = get_collection(client, KB_COLLECTION_NAME)
        if kb_collection.count() == 0:
            kb_collection = None
    except Exception:
        kb_collection = None

    info: dict = {
        "expanded_queries": [query],
        "hyde_used": False,
        "kb_searched": kb_collection is not None,
        "top_score": 0.0,
        "low_confidence": True,
        "num_candidates": 0,
    }

    if collection.count() == 0:
        return [], info

    # Step 1: Query expansion
    queries = expand_query(query) if use_query_expansion else [query]
    info["expanded_queries"] = queries

    # Step 2: HyDE document
    hyde_text: Optional[str] = None
    if use_hyde:
        hyde_text = generate_hyde_document(query)
        info["hyde_used"] = hyde_text is not None

    # Step 3: Dense search across paper collection
    all_dense: list[list[dict]] = []
    for q in queries:
        emb = embed_query(q)
        hits = dense_search(emb, collection, top_k=40, source_label="papers")
        all_dense.append(hits)

    # Dense search with HyDE embedding
    if hyde_text:
        hyde_emb = embed_query(hyde_text)
        hyde_hits = dense_search(hyde_emb, collection, top_k=30, source_label="papers")
        all_dense.append(hyde_hits)

    # Dense search in knowledge base collection (if available)
    if kb_collection:
        for q in queries[:2]:  # top 2 variants only for KB to keep latency low
            emb = embed_query(q)
            kb_hits = dense_search(emb, kb_collection, top_k=5, source_label="kb")
            if kb_hits:
                all_dense.append(kb_hits)

    # Step 4: Flatten + BM25
    seen_keys: set[str] = set()
    combined_dense: list[dict] = []
    for hits in all_dense:
        for h in hits:
            key = h["text"][:100]
            if key not in seen_keys:
                seen_keys.add(key)
                combined_dense.append(h)

    bm25_hits = bm25_search(query, combined_dense, top_k=30)

    # Step 5: RRF merge
    merged = merge_hits(*all_dense, bm25_hits)
    info["num_candidates"] = len(merged)

    # Step 6 & 7: Rerank + boost
    reranked = rerank(query, merged[:60], top_k=top_k)

    if reranked:
        raw_top = reranked[0]["score"] / reranked[0].get("boost_applied", 1.0)
        info["top_score"] = raw_top
        info["low_confidence"] = raw_top < LOW_CONFIDENCE_THRESHOLD

    return reranked, info


def format_context(hits: list[dict]) -> tuple[str, list[dict]]:
    """Format retrieved chunks as context string and return citation list."""
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
        has_figures = meta.get("has_figures", False)
        figures_dir = meta.get("figures_dir", "")

        evidence_label_map = {
            "guideline": "Clinical Guideline",
            "meta_analysis": "Meta-Analysis / Systematic Review",
            "rct": "Randomized Controlled Trial",
            "review": "Review",
            "primary": "Primary Study",
            "knowledge_base": "Synthesized Evidence",
        }

        # Knowledge base pages get their own label
        if hit.get("collection") == "kb" or source == "Knowledge Base":
            evidence_label = "Synthesized Evidence"
            evidence_level = "knowledge_base"
        else:
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
            "has_figures": has_figures,
            "figures_dir": figures_dir,
        })

    return "\n\n".join(context_parts), citations
