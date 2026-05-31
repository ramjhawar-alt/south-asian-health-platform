"""
RAG ingestion pipeline for South Asian health research.
Fetches papers from PubMed, PMC, Semantic Scholar, OpenAlex, and Unpaywall,
parses PDFs, extracts figures, chunks text, embeds with Voyage AI
(voyage-3.5 — biomedical domain model), and stores in ChromaDB.
"""
import hashlib
import os
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

import chromadb
import httpx
import pymupdf
import voyageai
from Bio import Entrez
from langchain_text_splitters import RecursiveCharacterTextSplitter
from semanticscholar import SemanticScholar

SOUTH_ASIAN_HEALTH_QUERIES = [
    # Metabolic & Endocrine
    "South Asian type 2 diabetes BMI",
    "South Asian metabolic syndrome",
    "South Asian insulin resistance",
    "South Asian insulin secretion beta cell function",
    "South Asian gestational diabetes mellitus",
    "South Asian diabetes glycemic control HbA1c",
    "South Asian diet glycemic index carbohydrate",
    # Cardiovascular
    "South Asian cardiovascular disease risk",
    "South Asian hypertension",
    "South Asian coronary artery disease",
    "South Asian stroke risk factors",
    "South Asian atrial fibrillation prevalence",
    "South Asian subclinical atherosclerosis CAC score",
    "South Asian lipid profile dyslipidemia",
    "MASALA study South Asian atherosclerosis",
    # Obesity & Body Composition
    "South Asian BMI obesity cutoff",
    "South Asian waist circumference abdominal obesity",
    "non-alcoholic fatty liver disease South Asian",
    "South Asian non-alcoholic steatohepatitis NASH",
    # Kidney & Urological
    "South Asian chronic kidney disease",
    "South Asian kidney stone nephrolithiasis",
    # Reproductive & Women's Health
    "PCOS polycystic ovary syndrome South Asian",
    "South Asian maternal mortality outcomes",
    "South Asian breast cancer age onset",
    # Nutritional & Bone
    "South Asian vitamin D deficiency",
    "South Asian osteoporosis bone density",
    "South Asian lactose intolerance dairy",
    # Mental & Sleep Health
    "South Asian mental health depression anxiety",
    "South Asian sleep apnea obstructive",
    # Cancer & Infectious Disease
    "South Asian colorectal cancer incidence",
    "South Asian TB tuberculosis susceptibility",
    # Other Conditions
    "thalassemia South Asian",
    "South Asian thyroid dysfunction hypothyroidism",
    "South Asian COVID-19 outcomes severity",
    # Lifestyle & Mechanisms
    "South Asian physical activity sedentary behavior",
    "South Asian diet health outcomes",
    "South Asian microbiome gut flora",
    "South Asian stress cortisol allostatic load",
    "diabetes mellitus Asian population",
]

CHUNK_SIZE = 1024
CHUNK_OVERLAP = 128
COLLECTION_NAME = "south_asian_health"
EMBEDDING_DIM = 1024  # voyage-3.5 output dimension

# Max texts per Voyage AI embedding request (Voyage allows up to 128).
# Using 50 to stay well within token-budget limits for long medical text.
VOYAGE_BATCH_SIZE = 50


def _get_voyage_client() -> voyageai.Client:
    api_key = os.getenv("VOYAGE_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "VOYAGE_API_KEY is not set. Get a free key at https://dash.voyageai.com"
        )
    return voyageai.Client(api_key=api_key)


def get_chroma_client(db_path: str) -> chromadb.ClientAPI:
    return chromadb.PersistentClient(path=db_path)


def get_collection(client: chromadb.ClientAPI, name: str = COLLECTION_NAME) -> chromadb.Collection:
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )


def _voyage_embed_with_backoff(
    vo: voyageai.Client,
    texts: list[str],
    input_type: str,
    max_retries: int = 6,
) -> list[list[float]]:
    """Embed a single batch with exponential backoff on rate limit errors.

    Free tier: 3 RPM / 10K TPM. After a RateLimitError we wait and retry.
    Adding a payment method at dashboard.voyageai.com unlocks standard limits
    (still free up to 200M tokens) and makes this much faster.
    """
    import voyageai as _vai
    delay = 22  # seconds — safely under 3 RPM on free tier
    for attempt in range(max_retries):
        try:
            result = vo.embed(texts, model="voyage-3.5", input_type=input_type)
            return result.embeddings
        except _vai.error.RateLimitError:
            if attempt == max_retries - 1:
                raise
            wait = delay * (2 ** attempt)  # 22s, 44s, 88s ...
            print(f"    [Voyage rate limit] waiting {wait}s before retry {attempt + 1}/{max_retries}...")
            time.sleep(wait)
        except Exception:
            raise
    return []  # unreachable


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of document texts using voyage-3.5.
    Batches requests and retries on rate limit errors."""
    if not texts:
        return []
    vo = _get_voyage_client()
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), VOYAGE_BATCH_SIZE):
        batch = texts[i: i + VOYAGE_BATCH_SIZE]
        embeddings = _voyage_embed_with_backoff(vo, batch, input_type="document")
        all_embeddings.extend(embeddings)
        if i + VOYAGE_BATCH_SIZE < len(texts):
            time.sleep(0.5)  # small pause between batches
    return all_embeddings


def embed_query(query: str) -> list[float]:
    """Embed a single search query using voyage-3.5 (query mode)."""
    vo = _get_voyage_client()
    embeddings = _voyage_embed_with_backoff(vo, [query], input_type="query")
    return embeddings[0]


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
    min_date: Optional[str] = None,
) -> list[dict]:
    """Fetch PubMed papers. When `high_evidence_only=True`, results are
    restricted to meta-analyses, systematic reviews, and guidelines.

    Args:
        min_date: If set, only fetch papers published on or after this date.
                  Format: YYYY/MM/DD (e.g. "2025/01/01"). Used for incremental runs.
    """
    Entrez.email = email
    papers = []
    seen_pmids: set[str] = set()

    for query in queries:
        try:
            if high_evidence_only:
                search_term = (
                    f'({query}) AND ("meta-analysis"[pt] OR "systematic review"[pt] '
                    f'OR "practice guideline"[pt] OR "guideline"[pt])'
                )
            else:
                search_term = query

            search_kwargs: dict = dict(db="pubmed", term=search_term, retmax=max_per_query, sort="relevance")
            if min_date:
                search_kwargs["mindate"] = min_date
                search_kwargs["datetype"] = "pdat"
            handle = Entrez.esearch(**search_kwargs)
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

                    # Extract DOI from PubmedData.ArticleIdList
                    doi = ""
                    for art_id in article.get("PubmedData", {}).get("ArticleIdList", []):
                        try:
                            if art_id.attributes.get("IdType") == "doi":
                                doi = str(art_id).strip()
                                break
                        except AttributeError:
                            pass
                    # Fallback: check Article.ELocationID
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


def fetch_semantic_scholar_papers(
    queries: list[str],
    max_per_query: int = 20,
) -> list[dict]:
    """Fetch papers from Semantic Scholar."""
    if max_per_query <= 0:
        print("  (Semantic Scholar disabled via max_per_query=0)")
        return []

    sch = SemanticScholar(timeout=10, retry=False)
    papers = []
    seen_ids: set[str] = set()

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


def fetch_openalex_papers(
    queries: list[str],
    email: str,
    max_per_query: int = 20,
    min_date: Optional[str] = None,
) -> list[dict]:
    """Fetch papers from OpenAlex — free, no auth required.
    OpenAlex has better open-access PDF linking and concept tagging than PubMed.
    Docs: https://docs.openalex.org/api-entities/works/search-works
    """
    papers = []
    seen_ids: set[str] = set()
    base_url = "https://api.openalex.org/works"

    for query in queries:
        try:
            oa_filter = "has_abstract:true"
            if min_date:
                # Convert YYYY/MM/DD → YYYY-MM-DD for OpenAlex
                oa_filter += f",from_publication_date:{min_date.replace('/', '-')}"
            params = {
                "search": query,
                "per-page": max_per_query,
                "filter": oa_filter,
                "select": "id,title,abstract_inverted_index,authorships,publication_year,doi,open_access,type",
                "mailto": email,  # polite pool for better rate limits
            }
            with httpx.Client(timeout=15.0) as client:
                resp = client.get(base_url, params=params)
            if resp.status_code != 200:
                continue

            data = resp.json()
            for work in data.get("results", []):
                work_id = work.get("id", "")
                if work_id in seen_ids:
                    continue
                seen_ids.add(work_id)

                # Reconstruct abstract from inverted index
                inv_index = work.get("abstract_inverted_index") or {}
                if not inv_index:
                    continue
                # inv_index maps word -> list of positions
                max_pos = max(pos for positions in inv_index.values() for pos in positions)
                words = [""] * (max_pos + 1)
                for word, positions in inv_index.items():
                    for pos in positions:
                        words[pos] = word
                abstract = " ".join(w for w in words if w)
                if not abstract.strip():
                    continue

                title = work.get("title", "") or ""
                doi = (work.get("doi") or "").replace("https://doi.org/", "")
                year = str(work.get("publication_year") or "")

                authorships = work.get("authorships", [])[:3]
                authors = []
                for authorship in authorships:
                    name = (authorship.get("author") or {}).get("display_name", "")
                    if name:
                        authors.append(name)
                if len(work.get("authorships", [])) > 3:
                    authors.append("et al.")

                papers.append({
                    "title": title,
                    "abstract": abstract,
                    "authors": ", ".join(authors),
                    "year": year,
                    "source": "OpenAlex",
                    "doi": doi,
                    "pmid": "",
                    "evidence_level": "primary",
                    "pub_types": work.get("type", ""),
                })
            time.sleep(0.1)  # polite rate limiting
        except Exception as e:
            print(f"OpenAlex query failed for '{query}': {e}")

    return papers


def _extract_pmc_text(article_xml: str) -> str:
    """Extract readable body text from a PMC full-text XML article."""
    try:
        root = ET.fromstring(article_xml)
    except ET.ParseError:
        return ""

    parts = []
    for title in root.iter("article-title"):
        if title.text:
            parts.append(title.text.strip())
            break
    for abstract in root.iter("abstract"):
        for p in abstract.iter("p"):
            text = "".join(p.itertext()).strip()
            if text:
                parts.append(text)
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


def _fetch_unpaywall_pdf_url(doi: str, email: str) -> Optional[str]:
    """Query the Unpaywall API for a legal open-access PDF URL."""
    if not doi:
        return None
    try:
        url = f"https://api.unpaywall.org/v2/{doi}?email={email}"
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url)
        if resp.status_code != 200:
            return None
        data = resp.json()
        best = data.get("best_oa_location") or {}
        return best.get("url_for_pdf")
    except Exception:
        return None


def _extract_caption_near_image(page: pymupdf.Page, img_bbox: tuple) -> str:
    """Attempt to find a 'Figure N' or 'Fig.' caption in the text block
    immediately below the image bounding box."""
    try:
        x0, y0, x1, y1 = img_bbox
        # Search in a region just below the image
        search_rect = pymupdf.Rect(x0, y1, x1, y1 + 60)
        caption_text = page.get_textbox(search_rect).strip()
        if caption_text.lower().startswith(("fig", "figure")):
            return caption_text[:300]
    except Exception:
        pass
    return ""


def extract_figures_from_pdf(
    pdf_path: str,
    paper_doi: str,
    figures_dir: str,
) -> list[dict]:
    """Extract figures from a PDF and save them to figures_dir.

    Returns a list of figure metadata dicts:
      {path, caption, page, width, height}
    Skips images smaller than 100x100px (icons, logos, decorative elements).
    """
    if not paper_doi:
        return []

    doi_hash = hashlib.md5(paper_doi.encode()).hexdigest()[:12]
    paper_fig_dir = Path(figures_dir) / doi_hash
    paper_fig_dir.mkdir(parents=True, exist_ok=True)

    figures = []
    try:
        doc = pymupdf.open(pdf_path)
        for page_num, page in enumerate(doc):
            page_images = page.get_images(full=True)
            for img_index, img in enumerate(page_images):
                xref = img[0]
                try:
                    image_data = doc.extract_image(xref)
                except Exception:
                    continue

                width = image_data.get("width", 0)
                height = image_data.get("height", 0)
                if width < 100 or height < 100:
                    continue

                ext = image_data.get("ext", "png")
                filename = f"page{page_num}_fig{img_index}.{ext}"
                fig_path = paper_fig_dir / filename

                with open(fig_path, "wb") as f:
                    f.write(image_data["image"])

                # Try to find a caption below the image
                # Get the image's bounding box on the page
                img_rects = page.get_image_rects(xref)
                caption = ""
                if img_rects:
                    bbox = img_rects[0]
                    caption = _extract_caption_near_image(page, bbox)

                figures.append({
                    "path": str(fig_path),
                    "rel_path": f"{doi_hash}/{filename}",
                    "caption": caption,
                    "page": page_num,
                    "width": width,
                    "height": height,
                })
        doc.close()
    except Exception as e:
        print(f"    Figure extraction failed for {pdf_path}: {e}")

    return figures


def _download_and_parse_pdf(
    pdf_url: str,
    paper_doi: str = "",
    figures_dir: Optional[str] = None,
) -> tuple[str, list[dict]]:
    """Download a PDF, extract full text and optionally figures.

    Returns (full_text, figures_list). Uses a temp file; nothing persists
    to disk except figures (when figures_dir is provided).
    """
    tmp_path = None
    try:
        with httpx.Client(timeout=30.0, follow_redirects=True) as client:
            resp = client.get(
                pdf_url,
                headers={"User-Agent": "SouthAsianHealthRAG/1.0 (academic research)"},
            )
        if resp.status_code != 200 or not resp.content:
            return "", []

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(resp.content)
            tmp_path = f.name

        doc = pymupdf.open(tmp_path)
        text = "".join(page.get_text() for page in doc)
        doc.close()

        figures: list[dict] = []
        if figures_dir and paper_doi:
            figures = extract_figures_from_pdf(tmp_path, paper_doi, figures_dir)

        return text.strip(), figures
    except Exception:
        return "", []
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def enrich_papers_with_unpaywall(
    papers: list[dict],
    email: str,
    max_papers: int = 100,
    rate_limit_delay: float = 0.15,
    figures_dir: Optional[str] = None,
) -> tuple[list[dict], int]:
    """Upgrade papers from abstract-only to full text using Unpaywall.
    Also extracts figures if figures_dir is provided."""
    upgraded = 0
    attempted = 0

    for paper in papers:
        if attempted >= max_papers:
            break

        doi = paper.get("doi", "").strip()
        if not doi:
            continue

        if paper.get("source") in ("PMC Full Text", "Unpaywall PDF"):
            continue

        attempted += 1
        pdf_url = _fetch_unpaywall_pdf_url(doi, email)
        time.sleep(rate_limit_delay)

        if not pdf_url:
            continue

        full_text, figures = _download_and_parse_pdf(pdf_url, doi, figures_dir)
        if full_text and len(full_text) > 500:
            paper["abstract"] = full_text
            paper["source"] = "Unpaywall PDF"
            if figures:
                paper["figures"] = figures
                paper["has_figures"] = True
                paper["figures_dir"] = hashlib.md5(doi.encode()).hexdigest()[:12]
            upgraded += 1
            fig_note = f" ({len(figures)} figures)" if figures else ""
            print(f"    ✓ Full text via Unpaywall{fig_note}: {paper['title'][:70]}...")
        else:
            print(f"    ✗ PDF empty or too short: {paper['title'][:70]}")

    return papers, upgraded


def deduplicate_papers(papers: list[dict]) -> list[dict]:
    """Deduplicate papers across sources by DOI first, then PMID, then title.
    Keeps the richest version (full text > abstract) when duplicates exist."""
    # Priority order for deduplication: DOI > PMID > title (lowercased)
    seen_dois: dict[str, int] = {}   # doi -> index in result list
    seen_pmids: dict[str, int] = {}  # pmid -> index in result list
    result: list[dict] = []

    source_priority = {
        "Unpaywall PDF": 5,
        "PMC Full Text": 4,
        "Clinical Guideline": 4,
        "PDF": 3,
        "PubMed": 2,
        "MASALA Study / PubMed": 2,
        "OpenAlex": 1,
        "Semantic Scholar": 1,
    }

    def _priority(paper: dict) -> int:
        return source_priority.get(paper.get("source", ""), 0)

    for paper in papers:
        doi = paper.get("doi", "").strip().lower()
        pmid = paper.get("pmid", "").strip()

        # Check DOI collision
        if doi:
            if doi in seen_dois:
                existing_idx = seen_dois[doi]
                if _priority(paper) > _priority(result[existing_idx]):
                    result[existing_idx] = paper
                continue
            seen_dois[doi] = len(result)

        # Check PMID collision
        if pmid:
            if pmid in seen_pmids:
                existing_idx = seen_pmids[pmid]
                if _priority(paper) > _priority(result[existing_idx]):
                    result[existing_idx] = paper
                if doi:
                    seen_dois[doi] = existing_idx
                continue
            seen_pmids[pmid] = len(result)

        if doi:
            seen_dois[doi] = len(result)
        if pmid:
            seen_pmids[pmid] = len(result)
        result.append(paper)

    return result


def _flush_batch(
    collection: chromadb.Collection,
    ids_batch: list[str],
    texts_batch: list[str],
    metas_batch: list[dict],
) -> int:
    """Dedupe IDs within the batch then embed and upsert. Returns count written."""
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
    batch_size: int = 50,
) -> int:
    total_ingested = 0
    texts_batch: list[str] = []
    metas_batch: list[dict] = []
    ids_batch: list[str] = []

    for paper in papers:
        text_content = f"{paper['title']}\n\n{paper['abstract']}"
        chunks = chunk_text(text_content)

        has_figures = paper.get("has_figures", False)
        figures_dir_hash = paper.get("figures_dir", "")

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
                "has_figures": has_figures,
                "figures_dir": figures_dir_hash,
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
    figures_dir: Optional[str] = None,
) -> int:
    doc = pymupdf.open(pdf_path)
    full_text = ""
    for page in doc:
        full_text += page.get_text()
    doc.close()

    chunks = chunk_text(full_text)
    if not chunks:
        return 0

    # Extract figures if figures_dir provided and there's a DOI to key on
    doi = (metadata_override or {}).get("doi", "")
    figures: list[dict] = []
    if figures_dir and doi:
        figures = extract_figures_from_pdf(pdf_path, doi, figures_dir)

    has_figures = len(figures) > 0
    figures_dir_hash = hashlib.md5(doi.encode()).hexdigest()[:12] if doi and has_figures else ""

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
        meta = {
            **meta_base,
            "chunk_index": i,
            "has_figures": has_figures,
            "figures_dir": figures_dir_hash,
        }
        texts_batch.append(chunk)
        metas_batch.append(meta)
        ids_batch.append(chunk_id)

    return _flush_batch(collection, ids_batch, texts_batch, metas_batch)


def ingest_guidelines_folder(
    folder_path: str,
    collection: chromadb.Collection,
    figures_dir: Optional[str] = None,
) -> int:
    """Ingest all PDFs in a clinical guidelines folder as high-priority sources."""
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
            n = ingest_pdf(str(pdf), collection, metadata_override=meta, figures_dir=figures_dir)
            print(f"  Ingested {n} chunks from guideline: {pdf.name}")
            total += n
        except Exception as e:
            print(f"  Failed to ingest {pdf.name}: {e}")

    return total


def run_full_ingestion(
    chroma_db_path: str,
    entrez_email: str,
    pubmed_max: int = 50,
    semantic_scholar_max: int = 20,
    pmc_max: int = 20,
    openalex_max: int = 20,
    high_evidence_max: int = 30,
    guidelines_path: str = "../data/guidelines",
    unpaywall_enrich: bool = True,
    unpaywall_max_papers: int = 100,
    figures_dir: Optional[str] = None,
    reset_collection: bool = False,
    min_date: Optional[str] = None,
) -> dict:
    """Run the full ingestion pipeline.

    Args:
        reset_collection: If True, delete and recreate the ChromaDB collection.
            Required when switching embedding models.
        min_date: If set (format YYYY/MM/DD), only fetch papers published on or
            after this date. Used for incremental weekly/monthly runs to avoid
            re-processing the entire corpus.
    """
    chroma_client = get_chroma_client(chroma_db_path)

    if reset_collection:
        try:
            chroma_client.delete_collection(COLLECTION_NAME)
            print(f"  Deleted existing collection '{COLLECTION_NAME}' for fresh re-index.")
        except Exception:
            pass

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
    if unpaywall_enrich and high_evidence_papers:
        print(f"  Enriching with Unpaywall full text (up to {unpaywall_max_papers})...")
        high_evidence_papers, upgraded = enrich_papers_with_unpaywall(
            high_evidence_papers, entrez_email,
            max_papers=unpaywall_max_papers, figures_dir=figures_dir
        )
        print(f"  -> Upgraded {upgraded}/{len(high_evidence_papers)} to full text via Unpaywall")
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
    if unpaywall_enrich and pubmed_papers:
        print(f"  Enriching with Unpaywall full text (up to {unpaywall_max_papers})...")
        pubmed_papers, upgraded = enrich_papers_with_unpaywall(
            pubmed_papers, entrez_email,
            max_papers=unpaywall_max_papers, figures_dir=figures_dir
        )
        print(f"  -> Upgraded {upgraded}/{len(pubmed_papers)} to full text via Unpaywall")
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

    print("Fetching OpenAlex papers...")
    openalex_papers = fetch_openalex_papers(
        SOUTH_ASIAN_HEALTH_QUERIES,
        entrez_email,
        max_per_query=openalex_max,
    )
    print(f"  Found {len(openalex_papers)} OpenAlex papers")
    if openalex_papers:
        n = ingest_papers_to_chroma(openalex_papers, collection)
        total_chunks += n
        print(f"  -> Ingested {n} OpenAlex chunks (total: {total_chunks})")

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
    guideline_chunks = ingest_guidelines_folder(
        guidelines_path, collection, figures_dir=figures_dir
    )
    print(f"  Ingested {guideline_chunks} chunks from guidelines")

    unpaywall_count = (
        sum(1 for p in high_evidence_papers if p.get("source") == "Unpaywall PDF")
        + sum(1 for p in pubmed_papers if p.get("source") == "Unpaywall PDF")
    )

    return {
        "high_evidence_count": len(high_evidence_papers),
        "pubmed_count": len(pubmed_papers),
        "pmc_count": len(pmc_papers),
        "openalex_count": len(openalex_papers),
        "semantic_scholar_count": len(ss_papers),
        "unpaywall_upgraded": unpaywall_count,
        "total_chunks": total_chunks + guideline_chunks,
        "guideline_chunks": guideline_chunks,
    }
