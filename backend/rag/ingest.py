"""
RAG ingestion pipeline for South Asian health research.
Fetches papers from PubMed and Semantic Scholar, parses PDFs,
chunks text, embeds with a lightweight local deterministic embedder,
and stores in ChromaDB.
"""
import hashlib
import os
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

import chromadb
import numpy as np
import pymupdf
from Bio import Entrez
from langchain_text_splitters import RecursiveCharacterTextSplitter
from semanticscholar import SemanticScholar

SOUTH_ASIAN_HEALTH_QUERIES = [
    "South Asian type 2 diabetes BMI",
    "South Asian cardiovascular disease risk",
    "South Asian metabolic syndrome",
    "South Asian hypertension",
    "South Asian vitamin D deficiency",
    "thalassemia South Asian",
    "non-alcoholic fatty liver disease South Asian",
    "PCOS polycystic ovary syndrome South Asian",
    "South Asian BMI obesity cutoff",
    "coronary artery disease South Asian",
    "South Asian insulin resistance",
    "South Asian stroke risk factors",
    "South Asian diet health outcomes",
    "South Asian chronic kidney disease",
    "diabetes mellitus Asian population",
    "South Asian mental health depression anxiety",
    "South Asian maternal mortality outcomes",
    "South Asian colorectal cancer incidence",
    "South Asian lactose intolerance prevalence",
    "South Asian sleep apnea obstructive",
    "South Asian breast cancer age onset",
    "South Asian kidney stone nephrolithiasis",
    "South Asian osteoporosis bone density",
    "South Asian TB tuberculosis susceptibility",
    "South Asian gestational diabetes mellitus",
]

CHUNK_SIZE = 1024
CHUNK_OVERLAP = 128
COLLECTION_NAME = "south_asian_health"
EMBEDDING_DIM = 384


def _embed_text_deterministic(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    """
    Lightweight deterministic embedding based on hashed token features.
    This avoids heavy ML runtime dependencies so low-memory deployments
    (e.g. Render free tier) can start reliably.
    """
    vec = np.zeros(dim, dtype=np.float32)
    if not text:
        return vec.tolist()

    tokens = text.lower().split()
    for tok in tokens:
        h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if ((h >> 1) & 1) == 0 else -1.0
        vec[idx] += sign

    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec.tolist()


def get_chroma_client(db_path: str) -> chromadb.ClientAPI:
    return chromadb.PersistentClient(path=db_path)


def get_collection(client: chromadb.ClientAPI) -> chromadb.Collection:
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def embed_texts(texts: list[str]) -> list[list[float]]:
    return [_embed_text_deterministic(t) for t in texts]


def embed_query(query: str) -> list[float]:
    return _embed_text_deterministic(query)


def doc_id(content: str) -> str:
    return hashlib.md5(content.encode()).hexdigest()


def chunk_text(text: str) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " "],
    )
    return splitter.split_text(text)


# Publication types considered highest-evidence for clinical questions.
# Retrieval will boost these over single primary studies.
HIGH_EVIDENCE_PUB_TYPES = {
    "Meta-Analysis",
    "Systematic Review",
    "Practice Guideline",
    "Guideline",
    "Consensus Development Conference",
    "Consensus Development Conference, NIH",
    "Review",
}


def _classify_evidence(pub_types: list[str]) -> str:
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


def fetch_pubmed_papers(
    queries: list[str],
    email: str,
    max_per_query: int = 50,
    high_evidence_only: bool = False,
) -> list[dict]:
    """Fetch PubMed papers. When `high_evidence_only=True`, results are
    restricted to meta-analyses, systematic reviews, and guidelines — the
    gold standard of evidence for clinical questions."""
    Entrez.email = email
    papers = []
    seen_pmids = set()

    for query in queries:
        try:
            if high_evidence_only:
                search_term = (
                    f'({query}) AND ("meta-analysis"[pt] OR "systematic review"[pt] '
                    f'OR "practice guideline"[pt] OR "guideline"[pt])'
                )
            else:
                search_term = query

            handle = Entrez.esearch(db="pubmed", term=search_term, retmax=max_per_query, sort="relevance")
            record = Entrez.read(handle)
            handle.close()
            pmids = record.get("IdList", [])

            new_pmids = [p for p in pmids if p not in seen_pmids]
            if not new_pmids:
                continue
            seen_pmids.update(new_pmids)

            fetch_handle = Entrez.efetch(
                db="pubmed", id=",".join(new_pmids), rettype="xml", retmode="xml"
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
                    evidence_level = _classify_evidence(pub_types)

                    authors_list = art.get("AuthorList", [])
                    authors = []
                    for a in authors_list[:3]:
                        last = a.get("LastName", "")
                        fore = a.get("ForeName", "")
                        if last:
                            authors.append(f"{last} {fore}".strip())
                    if len(art.get("AuthorList", [])) > 3:
                        authors.append("et al.")

                    papers.append({
                        "pmid": pmid,
                        "title": title,
                        "abstract": abstract,
                        "authors": ", ".join(authors),
                        "year": year,
                        "source": "PubMed",
                        "doi": "",
                        "evidence_level": evidence_level,
                        "pub_types": ", ".join(pub_types),
                    })
                except Exception:
                    continue
        except Exception as e:
            print(f"PubMed query failed for '{query}': {e}")

    return papers


def fetch_semantic_scholar_papers(
    queries: list[str],
    max_per_query: int = 20,
) -> list[dict]:
    """Fetch papers from Semantic Scholar. The public API is flaky and
    rate-limits aggressively, so we use a short retry timeout and skip
    failures silently rather than blocking ingestion."""
    if max_per_query <= 0:
        print("  (Semantic Scholar disabled via max_per_query=0)")
        return []

    sch = SemanticScholar(timeout=10, retry=False)
    papers = []
    seen_ids = set()

    for query in queries:
        try:
            results = sch.search_paper(query, limit=max_per_query, fields=[
                "title", "abstract", "authors", "year", "externalIds", "publicationDate"
            ])
            for paper in results:
                if not paper.abstract:
                    continue
                paper_id = paper.paperId
                if paper_id in seen_ids:
                    continue
                seen_ids.add(paper_id)

                ext_ids = paper.externalIds or {}
                doi = ext_ids.get("DOI", "")
                authors = []
                for a in (paper.authors or [])[:3]:
                    authors.append(a.name)
                if len(paper.authors or []) > 3:
                    authors.append("et al.")

                papers.append({
                    "paper_id": paper_id,
                    "title": paper.title or "",
                    "abstract": paper.abstract,
                    "authors": ", ".join(authors),
                    "year": str(paper.year or ""),
                    "source": "Semantic Scholar",
                    "doi": doi,
                    "evidence_level": "primary",
                    "pub_types": "",
                })
        except Exception as e:
            print(f"Semantic Scholar query failed for '{query}': {e}")

    return papers


def _extract_pmc_text(article_xml: str) -> str:
    """Extract readable body text from a PMC full-text XML article."""
    try:
        root = ET.fromstring(article_xml)
    except ET.ParseError:
        return ""

    parts = []
    # Pull title
    for title in root.iter("article-title"):
        if title.text:
            parts.append(title.text.strip())
            break
    # Pull abstract paragraphs
    for abstract in root.iter("abstract"):
        for p in abstract.iter("p"):
            text = "".join(p.itertext()).strip()
            if text:
                parts.append(text)
    # Pull body paragraphs (sections, paragraphs)
    for body in root.iter("body"):
        for p in body.iter("p"):
            text = "".join(p.itertext()).strip()
            if text:
                parts.append(text)

    return "\n\n".join(parts)


def fetch_pmc_fulltexts(
    queries: list[str],
    email: str,
    max_per_query: int = 20,
) -> list[dict]:
    """Fetch full-text open-access articles from PubMed Central."""
    Entrez.email = email
    papers = []
    seen_ids: set[str] = set()

    for query in queries:
        try:
            handle = Entrez.esearch(
                db="pmc",
                term=f"{query} open access[filter]",
                retmax=max_per_query,
                sort="relevance",
            )
            record = Entrez.read(handle)
            handle.close()
            pmc_ids = record.get("IdList", [])

            new_ids = [pid for pid in pmc_ids if pid not in seen_ids]
            if not new_ids:
                continue
            seen_ids.update(new_ids)

            fetch_handle = Entrez.efetch(
                db="pmc",
                id=",".join(new_ids),
                rettype="xml",
                retmode="xml",
            )
            raw_xml = fetch_handle.read()
            fetch_handle.close()

            # PMC returns multiple articles in one XML — split by <article> tag
            try:
                root = ET.fromstring(raw_xml if isinstance(raw_xml, str) else raw_xml.decode("utf-8", errors="replace"))
            except ET.ParseError:
                continue

            articles = root.findall(".//article") or ([root] if root.tag == "article" else [])

            for article_el in articles:
                try:
                    article_str = ET.tostring(article_el, encoding="unicode")
                    full_text = _extract_pmc_text(article_str)
                    if not full_text or len(full_text) < 200:
                        continue

                    # Extract metadata
                    title_el = article_el.find(".//article-title")
                    title = "".join(title_el.itertext()).strip() if title_el is not None else ""

                    year = ""
                    year_el = article_el.find(".//pub-date/year")
                    if year_el is not None and year_el.text:
                        year = year_el.text.strip()

                    authors = []
                    for contrib in article_el.findall(".//contrib[@contrib-type='author']")[:3]:
                        surname = contrib.findtext(".//surname", "")
                        given = contrib.findtext(".//given-names", "")
                        if surname:
                            authors.append(f"{surname} {given}".strip())
                    if len(article_el.findall(".//contrib[@contrib-type='author']")) > 3:
                        authors.append("et al.")

                    doi = ""
                    for article_id in article_el.findall(".//article-id"):
                        if article_id.get("pub-id-type") == "doi":
                            doi = article_id.text or ""
                            break

                    pmid = ""
                    for article_id in article_el.findall(".//article-id"):
                        if article_id.get("pub-id-type") == "pmid":
                            pmid = article_id.text or ""
                            break

                    papers.append({
                        "title": title,
                        "abstract": full_text,
                        "authors": ", ".join(authors),
                        "year": year,
                        "source": "PMC Full Text",
                        "doi": doi,
                        "pmid": pmid,
                        "evidence_level": "primary",
                        "pub_types": "",
                    })
                except Exception:
                    continue

        except Exception as e:
            print(f"PMC query failed for '{query}': {e}")

    return papers


def _flush_batch(
    collection: chromadb.Collection,
    ids_batch: list[str],
    texts_batch: list[str],
    metas_batch: list[dict],
) -> int:
    """Dedupe IDs within the batch (Chroma.upsert disallows duplicates
    in a single call) then embed and upsert. Returns count written."""
    if not ids_batch:
        return 0

    seen: set[str] = set()
    unique_ids: list[str] = []
    unique_texts: list[str] = []
    unique_metas: list[dict] = []
    for i, cid in enumerate(ids_batch):
        if cid in seen:
            continue
        seen.add(cid)
        unique_ids.append(cid)
        unique_texts.append(texts_batch[i])
        unique_metas.append(metas_batch[i])

    if not unique_ids:
        return 0

    embeddings = embed_texts(unique_texts)
    collection.upsert(
        ids=unique_ids,
        embeddings=embeddings,
        documents=unique_texts,
        metadatas=unique_metas,
    )
    return len(unique_ids)


def ingest_papers_to_chroma(
    papers: list[dict],
    collection: chromadb.Collection,
    batch_size: int = 100,
) -> int:
    total_ingested = 0
    texts_batch: list[str] = []
    metas_batch: list[dict] = []
    ids_batch: list[str] = []

    for paper in papers:
        text_content = f"{paper['title']}\n\n{paper['abstract']}"
        chunks = chunk_text(text_content)

        for i, chunk in enumerate(chunks):
            chunk_id = doc_id(chunk)
            meta = {
                "title": paper["title"][:500],
                "authors": paper["authors"][:200],
                "year": paper["year"],
                "source": paper["source"],
                "doi": paper.get("doi", ""),
                "pmid": paper.get("pmid", ""),
                "evidence_level": paper.get("evidence_level", "primary"),
                "pub_types": paper.get("pub_types", "")[:200],
                "chunk_index": i,
            }
            texts_batch.append(chunk)
            metas_batch.append(meta)
            ids_batch.append(chunk_id)

            if len(texts_batch) >= batch_size:
                total_ingested += _flush_batch(collection, ids_batch, texts_batch, metas_batch)
                texts_batch, metas_batch, ids_batch = [], [], []

    total_ingested += _flush_batch(collection, ids_batch, texts_batch, metas_batch)
    return total_ingested


def ingest_pdf(
    pdf_path: str,
    collection: chromadb.Collection,
    metadata_override: Optional[dict] = None,
) -> int:
    doc = pymupdf.open(pdf_path)
    full_text = ""
    for page in doc:
        full_text += page.get_text()
    doc.close()

    chunks = chunk_text(full_text)
    if not chunks:
        return 0

    meta_base = metadata_override or {
        "title": Path(pdf_path).stem,
        "authors": "",
        "year": "",
        "source": "PDF",
        "doi": "",
        "pmid": "",
        "evidence_level": "primary",
        "pub_types": "",
    }

    texts_batch: list[str] = []
    metas_batch: list[dict] = []
    ids_batch: list[str] = []

    for i, chunk in enumerate(chunks):
        chunk_id = doc_id(chunk)
        meta = {**meta_base, "chunk_index": i}
        texts_batch.append(chunk)
        metas_batch.append(meta)
        ids_batch.append(chunk_id)

    return _flush_batch(collection, ids_batch, texts_batch, metas_batch)


def ingest_guidelines_folder(
    folder_path: str,
    collection: chromadb.Collection,
) -> int:
    """Ingest all PDFs in a clinical guidelines folder as high-priority sources.
    These are tagged with evidence_level=guideline so the retriever and LLM
    can give them authoritative weight."""
    folder = Path(folder_path)
    if not folder.exists():
        print(f"  Guidelines folder {folder_path} does not exist, skipping.")
        return 0

    pdf_files = list(folder.glob("*.pdf"))
    if not pdf_files:
        print(f"  No PDFs found in {folder_path}.")
        return 0

    total = 0
    for pdf in pdf_files:
        try:
            meta = {
                "title": pdf.stem,
                "authors": "",
                "year": "",
                "source": "Clinical Guideline",
                "doi": "",
                "pmid": "",
                "evidence_level": "guideline",
                "pub_types": "guideline",
            }
            n = ingest_pdf(str(pdf), collection, metadata_override=meta)
            print(f"  Ingested {n} chunks from guideline: {pdf.name}")
            total += n
        except Exception as e:
            print(f"  Failed to ingest {pdf.name}: {e}")

    return total


def run_full_ingestion(
    chroma_db_path: str,
    entrez_email: str,
    pubmed_max: int = 50,
    semantic_scholar_max: int = 50,
    pmc_max: int = 20,
    high_evidence_max: int = 30,
    guidelines_path: str = "../data/guidelines",
) -> dict:
    chroma_client = get_chroma_client(chroma_db_path)
    collection = get_collection(chroma_client)

    total_chunks = 0

    print("Fetching high-evidence PubMed papers (meta-analyses, systematic reviews, guidelines)...")
    high_evidence_papers = fetch_pubmed_papers(
        SOUTH_ASIAN_HEALTH_QUERIES,
        entrez_email,
        max_per_query=high_evidence_max,
        high_evidence_only=True,
    )
    print(f"  Found {len(high_evidence_papers)} high-evidence papers")
    if high_evidence_papers:
        n = ingest_papers_to_chroma(high_evidence_papers, collection)
        total_chunks += n
        print(f"  -> Ingested {n} high-evidence chunks (total: {total_chunks})")

    print("Fetching general PubMed papers...")
    pubmed_papers = fetch_pubmed_papers(
        SOUTH_ASIAN_HEALTH_QUERIES,
        entrez_email,
        max_per_query=pubmed_max,
        high_evidence_only=False,
    )
    print(f"  Found {len(pubmed_papers)} PubMed papers")
    if pubmed_papers:
        n = ingest_papers_to_chroma(pubmed_papers, collection)
        total_chunks += n
        print(f"  -> Ingested {n} PubMed chunks (total: {total_chunks})")

    print("Fetching PMC full-text papers...")
    pmc_papers = fetch_pmc_fulltexts(
        SOUTH_ASIAN_HEALTH_QUERIES,
        entrez_email,
        max_per_query=pmc_max,
    )
    print(f"  Found {len(pmc_papers)} PMC full-text papers")
    if pmc_papers:
        n = ingest_papers_to_chroma(pmc_papers, collection)
        total_chunks += n
        print(f"  -> Ingested {n} PMC chunks (total: {total_chunks})")

    print("Fetching Semantic Scholar papers...")
    ss_papers = fetch_semantic_scholar_papers(
        SOUTH_ASIAN_HEALTH_QUERIES,
        max_per_query=semantic_scholar_max,
    )
    print(f"  Found {len(ss_papers)} Semantic Scholar papers")
    if ss_papers:
        n = ingest_papers_to_chroma(ss_papers, collection)
        total_chunks += n
        print(f"  -> Ingested {n} Semantic Scholar chunks (total: {total_chunks})")

    print("Ingesting clinical guidelines (if any)...")
    guideline_chunks = ingest_guidelines_folder(guidelines_path, collection)
    print(f"  Ingested {guideline_chunks} chunks from guidelines")

    return {
        "high_evidence_count": len(high_evidence_papers),
        "pubmed_count": len(pubmed_papers),
        "semantic_scholar_count": len(ss_papers),
        "pmc_count": len(pmc_papers),
        "total_chunks": total_chunks + guideline_chunks,
        "guideline_chunks": guideline_chunks,
    }
