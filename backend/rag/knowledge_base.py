"""
Karpathy-style LLM Wiki for South Asian health knowledge.

Instead of only storing raw text chunks, this module builds and maintains
a structured, pre-synthesized knowledge base of markdown pages organized
by topic. Pages are:
  - Not raw quotes — synthesized summaries with structured sections
  - Cross-referenced and organized by condition / mechanism / intervention
  - Indexed in ChromaDB as a separate collection (south_asian_kb)
  - Updated incrementally as new papers are ingested

Build strategy (topic-first, not paper-by-paper):
  For each topic page, query ChromaDB for the top N most relevant chunks,
  then run ONE Groq LLM call to synthesize those chunks into a structured
  wiki page. This requires ~25 LLM calls total (one per page), not one per
  paper (~1,700 calls).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import chromadb
from groq import Groq

from .ingest import (
    COLLECTION_NAME,
    chunk_text,
    doc_id,
    embed_query,
    embed_texts,
    get_chroma_client,
    get_collection,
)

KB_COLLECTION_NAME = "south_asian_kb"

# ── Topic Page Definitions ─────────────────────────────────────────────────────

@dataclass
class TopicPage:
    title:        str
    path:         str
    search_query: str
    top_k:        int       = 40   # total unique chunks to retrieve for synthesis
    sub_queries:  list[str] = field(default_factory=list)  # additional search angles


ALL_TOPIC_PAGES: list[TopicPage] = [
    # ── Conditions — high-density (top_k=80) ──────────────────────────────────
    TopicPage(
        "Type 2 Diabetes in South Asians",
        "conditions/type_2_diabetes.md",
        "South Asian type 2 diabetes mellitus prevalence risk insulin HbA1c",
        top_k=80,
        sub_queries=[
            "South Asian diabetes pathophysiology beta cell dysfunction insulin secretion",
            "South Asian T2DM management metformin glycemic control treatment outcomes",
            "South Asian diabetes risk factors BMI waist adiposity onset age",
        ],
    ),
    TopicPage(
        "Cardiovascular Disease in South Asians",
        "conditions/cardiovascular_disease.md",
        "South Asian cardiovascular disease coronary artery disease heart attack risk mortality",
        top_k=80,
        sub_queries=[
            "South Asian myocardial infarction premature CAD atherosclerosis MASALA MESA",
            "South Asian cardiovascular risk factors dyslipidemia hypertension smoking",
            "South Asian coronary artery calcium Framingham risk score prevention statin",
        ],
    ),
    TopicPage(
        "Metabolic Syndrome in South Asians",
        "conditions/metabolic_syndrome.md",
        "South Asian metabolic syndrome waist circumference triglycerides HDL glucose",
        top_k=80,
        sub_queries=[
            "South Asian metabolic syndrome IDF ATP criteria prevalence diagnosis",
            "South Asian insulin resistance visceral adiposity metabolic syndrome pathophysiology",
        ],
    ),
    TopicPage(
        "Hypertension in South Asians",
        "conditions/hypertension.md",
        "South Asian hypertension blood pressure prevalence treatment",
        top_k=80,
        sub_queries=[
            "South Asian hypertension pathophysiology salt sensitivity renin-angiotensin",
            "South Asian blood pressure cardiovascular risk ACE inhibitor ARB antihypertensive",
            "South Asian hypertension guidelines JNC WHO NICE lower target threshold",
        ],
    ),
    TopicPage(
        "Obesity and BMI Thresholds for South Asians",
        "conditions/obesity_bmi_thresholds.md",
        "South Asian BMI cutoff obesity overweight body fat waist circumference adiposity",
        top_k=80,
        sub_queries=[
            "South Asian BMI 23 25 WHO revised threshold diabetes cardiovascular risk",
            "South Asian body composition percent body fat lean mass visceral fat",
            "South Asian waist circumference abdominal obesity cutoff 80 90 cm",
        ],
    ),
    # ── Conditions — medium-density (top_k=50) ────────────────────────────────
    TopicPage(
        "Vitamin D Deficiency in South Asians",
        "conditions/vitamin_d_deficiency.md",
        "South Asian vitamin D deficiency prevalence supplementation sunlight",
        top_k=50,
        sub_queries=[
            "South Asian vitamin D bone density osteoporosis fracture cardiometabolic risk",
        ],
    ),
    TopicPage(
        "PCOS in South Asian Women",
        "conditions/pcos.md",
        "South Asian polycystic ovary syndrome PCOS prevalence hormones fertility",
        top_k=50,
        sub_queries=[
            "South Asian PCOS insulin resistance hyperandrogenism treatment metformin lifestyle",
        ],
    ),
    TopicPage(
        "Non-Alcoholic Fatty Liver Disease in South Asians",
        "conditions/nafld.md",
        "South Asian non-alcoholic fatty liver disease NAFLD NASH prevalence",
        top_k=50,
        sub_queries=[
            "South Asian NAFLD insulin resistance visceral fat liver fibrosis progression",
        ],
    ),
    TopicPage(
        "Chronic Kidney Disease in South Asians",
        "conditions/chronic_kidney_disease.md",
        "South Asian chronic kidney disease CKD prevalence diabetes hypertension",
        top_k=50,
        sub_queries=[
            "South Asian CKD eGFR creatinine progression dialysis kidney outcomes",
        ],
    ),
    TopicPage(
        "Stroke Risk in South Asians",
        "conditions/stroke.md",
        "South Asian stroke cerebrovascular disease risk factors incidence",
        top_k=50,
        sub_queries=[
            "South Asian hemorrhagic ischemic stroke atrial fibrillation hypertension prevention",
        ],
    ),
    TopicPage(
        "Gestational Diabetes in South Asian Women",
        "conditions/gestational_diabetes.md",
        "South Asian gestational diabetes mellitus GDM prevalence outcomes",
        top_k=50,
        sub_queries=[
            "South Asian GDM screening IADPSG WHO criteria postpartum type 2 diabetes risk",
        ],
    ),
    TopicPage(
        "Mental Health in South Asian Populations",
        "conditions/mental_health.md",
        "South Asian mental health depression anxiety prevalence barriers treatment stigma",
        top_k=50,
        sub_queries=[
            "South Asian depression acculturation immigration discrimination help-seeking",
            "South Asian anxiety PTSD somatization cultural mental health barriers",
        ],
    ),
    # ── Conditions — niche (top_k=30, no sub_queries) ─────────────────────────
    TopicPage(
        "Thalassemia in South Asian Populations",
        "conditions/thalassemia.md",
        "thalassemia South Asian carrier prevalence screening treatment",
        top_k=30,
    ),
    TopicPage(
        "Tuberculosis Susceptibility in South Asians",
        "conditions/tuberculosis.md",
        "South Asian tuberculosis TB susceptibility prevalence latent active",
        top_k=30,
    ),
    TopicPage(
        "Obstructive Sleep Apnea in South Asians",
        "conditions/sleep_apnea.md",
        "South Asian obstructive sleep apnea OSA prevalence risk BMI",
        top_k=30,
    ),
    # ── Mechanisms — high-density ─────────────────────────────────────────────
    TopicPage(
        "Insulin Resistance in South Asians",
        "mechanisms/insulin_resistance.md",
        "South Asian insulin resistance pathophysiology beta cell dysfunction hyperinsulinemia",
        top_k=80,
        sub_queries=[
            "South Asian HOMA-IR insulin sensitivity euglycemic hyperinsulinemic clamp",
            "South Asian ectopic fat liver muscle pericardial insulin resistance mechanism",
            "South Asian fetal programming thrifty phenotype insulin resistance epigenetics",
        ],
    ),
    # ── Mechanisms — medium-density ───────────────────────────────────────────
    TopicPage(
        "Visceral Adiposity and Ectopic Fat in South Asians",
        "mechanisms/visceral_adiposity.md",
        "South Asian visceral fat ectopic adiposity liver muscle pericardial fat",
        top_k=50,
        sub_queries=[
            "South Asian DEXA MRI body composition intrahepatic lipid ectopic fat cardiometabolic",
        ],
    ),
    TopicPage(
        "Inflammation and Cardiometabolic Risk in South Asians",
        "mechanisms/inflammation.md",
        "South Asian chronic inflammation CRP cytokines cardiometabolic risk",
        top_k=50,
        sub_queries=[
            "South Asian IL-6 TNF-alpha adiponectin leptin inflammation endothelial dysfunction",
        ],
    ),
    # ── Risk Factors — high-density ───────────────────────────────────────────
    TopicPage(
        "South Asian-Specific Clinical Thresholds",
        "risk_factors/south_asian_specific_thresholds.md",
        "South Asian BMI waist circumference lipid blood pressure clinical cutoff threshold guideline",
        top_k=80,
        sub_queries=[
            "South Asian diabetes screening earlier age lower BMI ADA recommendation",
            "South Asian cardiovascular risk QRISK lipid LDL target non-HDL threshold",
            "South Asian metabolic risk waist-to-height ratio abdominal obesity guideline",
        ],
    ),
    TopicPage(
        "Diet and Lifestyle in South Asian Health",
        "risk_factors/diet_and_lifestyle.md",
        "South Asian diet physical activity sedentary glycemic index rice wheat",
        top_k=80,
        sub_queries=[
            "South Asian dietary pattern carbohydrate refined grain glycemic load diabetes",
            "South Asian physical activity sedentary screen time exercise intervention",
            "South Asian vegetarianism dairy fat cooking oil dietary acculturation migration",
        ],
    ),
    # ── Risk Factors — medium-density ─────────────────────────────────────────
    TopicPage(
        "Genetic Factors in South Asian Disease Risk",
        "risk_factors/genetic_factors.md",
        "South Asian genetic polymorphism TCF7L2 FTO susceptibility variant",
        top_k=50,
        sub_queries=[
            "South Asian GWAS genome-wide association diabetes cardiovascular risk locus",
            "South Asian specific genetic variant pharmacogenomics drug response",
        ],
    ),
    # ── Interventions — medium-density ────────────────────────────────────────
    TopicPage(
        "Dietary Interventions for South Asians",
        "interventions/dietary_interventions.md",
        "South Asian dietary intervention low glycemic Mediterranean diet diabetes cardiovascular",
        top_k=50,
        sub_queries=[
            "South Asian culturally adapted diet intervention randomized trial glycemic HbA1c weight",
        ],
    ),
    TopicPage(
        "Pharmacological Management for South Asians",
        "interventions/pharmacological.md",
        "South Asian medication diabetes cardiovascular ACE inhibitor statin metformin efficacy",
        top_k=50,
        sub_queries=[
            "South Asian pharmacogenomics drug response statin myopathy SGLT2 GLP-1 efficacy",
        ],
    ),
    TopicPage(
        "Screening Guidelines for South Asian Populations",
        "interventions/screening_guidelines.md",
        "South Asian screening guidelines diabetes cardiovascular earlier age recommendation",
        top_k=50,
        sub_queries=[
            "South Asian preventive care primary care screening underdiagnosis health disparities",
        ],
    ),
]


# ── Page Synthesis ─────────────────────────────────────────────────────────────

KB_SYNTHESIS_PROMPT = """You are building a structured medical knowledge wiki for South Asian health.

Below are excerpts from peer-reviewed research papers relevant to the topic: **{topic_title}**

Your task: synthesize these excerpts into a structured wiki page. Requirements:
- Write synthesized summaries — NOT raw quotes or copy-pasted text
- Ground every factual claim in the provided sources; use numbered citations [1], [2], etc.
- Use the exact page structure shown below
- Where evidence comes from a non-South Asian population, flag it explicitly
- Be precise about numbers (prevalence rates, risk ratios, cutoff values)
- Under "Open Questions", note genuine gaps in the evidence
- Write in clear language accessible to a health-literate lay audience

---

SOURCE EXCERPTS:
{context}

---

Write the wiki page for **{topic_title}** using this exact structure:

# {topic_title}

## Overview
[2–3 sentence synthesis summarizing the state of evidence on this topic for South Asian populations]

## Key Evidence
[Bullet points summarizing the most important findings, each cited with [N]]

## South Asian-Specific Considerations
[Clinical thresholds, risk differences, or population-specific factors that differ from general guidelines. Include a comparison table if applicable.]

## Evidence Quality
| Evidence Type | Count |
|---|---|
| Meta-analyses / Systematic Reviews | ? |
| RCTs | ? |
| Observational studies | ? |

## Open Questions
[Genuine gaps: populations understudied, outcomes lacking data, conflicting findings]

## References
[Numbered list: [N] Author(s) et al. (Year). Title. Source. PMID/DOI if available.]

*Built: {date} | Sources: {n_sources} excerpts*"""


def _build_context_for_topic(
    topic: TopicPage,
    collection: chromadb.Collection,
) -> tuple[str, list[dict]]:
    """Query ChromaDB with all queries for this topic, deduplicate by text prefix,
    and return up to topic.top_k unique chunks as formatted context."""
    queries = [topic.search_query] + topic.sub_queries
    n_queries = len(queries)
    k_per_query = max(1, topic.top_k // n_queries)

    all_docs:  list[str]  = []
    all_metas: list[dict] = []
    seen_prefixes: set[str] = set()

    for q in queries:
        emb = embed_query(q)
        results = collection.query(
            query_embeddings=[emb],
            n_results=min(k_per_query, collection.count() or 1),
            include=["documents", "metadatas"],
        )
        for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
            prefix = doc[:80]
            if prefix not in seen_prefixes:
                seen_prefixes.add(prefix)
                all_docs.append(doc)
                all_metas.append(meta)
        if len(all_docs) >= topic.top_k:
            break

    all_docs  = all_docs[:topic.top_k]
    all_metas = all_metas[:topic.top_k]

    context_parts = []
    for i, (doc, meta) in enumerate(zip(all_docs, all_metas)):
        title   = meta.get("title",   "Unknown")
        authors = meta.get("authors", "")
        year    = meta.get("year",    "")
        source  = meta.get("source",  "")
        context_parts.append(f"[{i+1}] ({title}, {authors}, {year}, {source})\n{doc}")

    return "\n\n".join(context_parts), all_metas


def synthesize_page(
    topic: TopicPage,
    collection: chromadb.Collection,
    groq_client: Groq,
) -> str:
    """Generate a wiki page for a topic by synthesizing retrieved chunks.
    Retrieval budget (top_k) and search angles (sub_queries) live on the topic."""
    import re
    import time

    context, sources = _build_context_for_topic(topic, collection)

    prompt = KB_SYNTHESIS_PROMPT.format(
        topic_title=topic.title,
        context=context,
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        n_sources=len(sources),
    )

    # Retry up to 3 times on per-minute rate limits (TPM). Daily limits (TPD) are
    # re-raised immediately since sleeping won't help within the same run.
    for attempt in range(3):
        try:
            response = groq_client.chat.completions.create(
                model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=3000,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            msg = str(e)
            is_tpm = "tokens per minute" in msg
            is_tpd = "tokens per day" in msg
            if is_tpd or not is_tpm:
                raise  # daily limit or unknown error — don't retry
            # Parse "try again in Xs" from the error message
            match = re.search(r"try again in ([0-9.]+)s", msg)
            wait = float(match.group(1)) + 1.0 if match else 10.0
            print(f"    TPM limit hit, waiting {wait:.0f}s before retry {attempt + 1}/3...")
            time.sleep(wait)

    raise RuntimeError(f"synthesize_page failed after 3 attempts for: {topic.title}")


def write_page(kb_dir: Path, relative_path: str, content: str) -> None:
    page_path = kb_dir / relative_path
    page_path.parent.mkdir(parents=True, exist_ok=True)
    page_path.write_text(content, encoding="utf-8")


def update_index(kb_dir: Path, pages_built: list[TopicPage]) -> None:
    """Rewrite index.md with a categorized table of all built pages."""
    lines = [
        "# South Asian Health Knowledge Base — Index",
        "",
        f"*Last updated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}*",
        "",
    ]

    # Group by directory
    categories: dict[str, list[TopicPage]] = {}
    for page in pages_built:
        category = page.path.split("/")[0].replace("_", " ").title()
        categories.setdefault(category, []).append(page)

    for category, topic_pages in sorted(categories.items()):
        lines.append(f"## {category}")
        lines.append("")
        for tp in topic_pages:
            lines.append(f"- [{tp.title}]({tp.path})")
        lines.append("")

    (kb_dir / "index.md").write_text("\n".join(lines), encoding="utf-8")


def append_log(kb_dir: Path, pages_built: list[TopicPage], note: str = "") -> None:
    """Append a timestamped entry to the append-only log.md."""
    log_path = kb_dir / "log.md"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    entry_lines = [
        f"\n## {timestamp}",
        f"- Pages built/rebuilt: {len(pages_built)}",
    ]
    if note:
        entry_lines.append(f"- Note: {note}")
    for tp in pages_built:
        entry_lines.append(f"  - {tp.title} → {tp.path}")
    entry_lines.append("")

    with open(log_path, "a", encoding="utf-8") as f:
        f.write("\n".join(entry_lines))


# ── ChromaDB Indexing ──────────────────────────────────────────────────────────

def index_kb_pages(
    kb_dir: Path,
    kb_collection: chromadb.Collection,
    pages: Optional[list[TopicPage]] = None,
) -> int:
    """Embed and upsert knowledge base pages into the KB ChromaDB collection.

    Uses the same Voyage AI voyage-3.5 embeddings as the main corpus,
    so they're comparable during retrieval.
    """
    if pages is None:
        pages = ALL_TOPIC_PAGES

    texts: list[str] = []
    ids: list[str] = []
    metas: list[dict] = []

    for topic in pages:
        page_path = kb_dir / topic.path
        if not page_path.exists():
            continue
        content = page_path.read_text(encoding="utf-8")
        if not content.strip():
            continue

        # Chunk the page so long pages don't exceed embedding limits
        chunks = chunk_text(content)
        for i, chunk in enumerate(chunks):
            chunk_id = doc_id(chunk)
            ids.append(chunk_id)
            texts.append(chunk)
            metas.append({
                "title": topic.title,
                "path": topic.path,
                "source": "Knowledge Base",
                "evidence_level": "knowledge_base",
                "chunk_index": i,
                "authors": "",
                "year": "",
                "doi": "",
                "pmid": "",
                "pub_types": "",
                "has_figures": False,
                "figures_dir": "",
            })

    if not texts:
        return 0

    # Embed in batches
    from .ingest import VOYAGE_BATCH_SIZE
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), VOYAGE_BATCH_SIZE):
        batch = texts[i: i + VOYAGE_BATCH_SIZE]
        batch_embeddings = embed_texts(batch)
        all_embeddings.extend(batch_embeddings)

    # Upsert — dedupe IDs within batch first
    seen: set[str] = set()
    u_ids, u_texts, u_metas, u_embs = [], [], [], []
    for cid, text, meta, emb in zip(ids, texts, metas, all_embeddings):
        if cid not in seen:
            seen.add(cid)
            u_ids.append(cid)
            u_texts.append(text)
            u_metas.append(meta)
            u_embs.append(emb)

    if u_ids:
        kb_collection.upsert(
            ids=u_ids,
            embeddings=u_embs,
            documents=u_texts,
            metadatas=u_metas,
        )

    return len(u_ids)


# ── Main Build Entry Point ─────────────────────────────────────────────────────

def build_knowledge_base(
    chroma_db_path: str,
    kb_dir_path: str,
    groq_api_key: Optional[str] = None,
    pages: Optional[list[TopicPage]] = None,
    top_k_per_page: int = 40,  # deprecated — retrieval budget now lives on each TopicPage
    skip_existing: bool = False,
) -> dict:
    """Build (or rebuild) all knowledge base pages and index them in ChromaDB.

    Args:
        chroma_db_path: Path to the ChromaDB directory.
        kb_dir_path: Path where markdown pages will be written.
        groq_api_key: Groq API key. Falls back to GROQ_API_KEY env var.
        pages: Subset of pages to build. Defaults to ALL_TOPIC_PAGES.
        top_k_per_page: Deprecated. Retrieval budget is now configured per-topic
            via TopicPage.top_k. This parameter is ignored.
        skip_existing: If True, skip pages whose markdown file already exists
            (useful for resuming after a rate-limit failure).

    Returns:
        dict with pages_built, chunks_indexed, skipped, errors.
    """
    if pages is None:
        pages = ALL_TOPIC_PAGES

    api_key = groq_api_key or os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is required for knowledge base synthesis.")

    groq_client = Groq(api_key=api_key)
    chroma_client = get_chroma_client(chroma_db_path)
    collection = get_collection(chroma_client, COLLECTION_NAME)
    kb_collection = get_collection(chroma_client, KB_COLLECTION_NAME)

    kb_dir = Path(kb_dir_path)
    kb_dir.mkdir(parents=True, exist_ok=True)

    built_pages: list[TopicPage] = []
    skipped_pages: list[TopicPage] = []
    errors: list[str] = []

    print(f"Building knowledge base: {len(pages)} pages"
          + (" (skipping existing)" if skip_existing else "") + "...")

    for topic in pages:
        page_path = kb_dir / topic.path
        if skip_existing and page_path.exists() and page_path.stat().st_size > 100:
            skipped_pages.append(topic)
            print(f"  ⏭  Skipping (exists): {topic.path}")
            continue

        print(f"  Synthesizing: {topic.title}...")
        try:
            content = synthesize_page(topic, collection, groq_client)
            if content.strip():
                write_page(kb_dir, topic.path, content)
                built_pages.append(topic)
                print(f"    ✓ Written: {topic.path}")
            else:
                errors.append(f"Empty content for: {topic.title}")
                print(f"    ✗ Empty response for: {topic.title}")
        except Exception as e:
            errors.append(f"{topic.title}: {e}")
            print(f"    ✗ Error for {topic.title}: {e}")

    # Update index and log (include all pages that have files — built + skipped)
    all_present = built_pages + skipped_pages
    if all_present:
        update_index(kb_dir, all_present)
    if built_pages:
        append_log(kb_dir, built_pages)

    # Index ALL present pages in ChromaDB (not just newly built ones)
    pages_to_index = built_pages if not skipped_pages else all_present
    print(f"Indexing {len(pages_to_index)} pages in ChromaDB...")
    chunks_indexed = index_kb_pages(kb_dir, kb_collection, pages=pages_to_index)
    print(f"  Indexed {chunks_indexed} chunks into '{KB_COLLECTION_NAME}'")

    return {
        "pages_built": len(built_pages),
        "pages_skipped": len(skipped_pages),
        "chunks_indexed": chunks_indexed,
        "errors": errors,
    }
