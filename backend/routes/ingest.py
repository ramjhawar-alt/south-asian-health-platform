"""
Ingest API routes: admin endpoints to trigger research paper ingestion.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from rag.ingest import run_full_ingestion

router = APIRouter()

# Shared state for both full and incremental runs
_ingestion_status: dict = {"running": False, "last_result": None, "last_run_type": None}


class FullIngestRequest(BaseModel):
    pubmed_max: int = Field(50, description="Max papers per query from PubMed")
    semantic_scholar_max: int = Field(20, description="Max papers per query from Semantic Scholar")
    pmc_max: int = Field(20, description="Max papers per query from PMC full-text")
    openalex_max: int = Field(20, description="Max papers per query from OpenAlex")
    high_evidence_max: int = Field(30, description="Max high-evidence papers per query (meta-analyses etc.)")
    unpaywall_enrich: bool = Field(True, description="Attempt to upgrade to full text via Unpaywall")
    reset_collection: bool = Field(False, description="Delete and recreate the ChromaDB collection (needed after embedding model changes)")


class IncrementalIngestRequest(BaseModel):
    days_back: int = Field(14, description="Fetch papers published in the last N days", ge=1, le=365)
    pubmed_max: int = Field(30, description="Max papers per query from PubMed")
    openalex_max: int = Field(15, description="Max papers per query from OpenAlex")
    unpaywall_enrich: bool = Field(True, description="Attempt to upgrade to full text via Unpaywall")


def _make_min_date(days_back: int) -> str:
    """Return a YYYY/MM/DD date string for N days ago."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)
    return cutoff.strftime("%Y/%m/%d")


def _run_ingestion(
    chroma_path: str,
    entrez_email: str,
    guidelines_path: str,
    figures_dir: Optional[str],
    kwargs: dict,
    run_type: str,
) -> None:
    """Worker function executed in the background."""
    _ingestion_status["running"] = True
    _ingestion_status["last_run_type"] = run_type
    try:
        result = run_full_ingestion(
            chroma_db_path=chroma_path,
            entrez_email=entrez_email,
            guidelines_path=guidelines_path,
            figures_dir=figures_dir,
            **kwargs,
        )
        _ingestion_status["last_result"] = result
    except Exception as e:
        _ingestion_status["last_result"] = {"error": str(e)}
    finally:
        _ingestion_status["running"] = False


@router.post("/ingest/run")
async def trigger_full_ingestion(
    request: FullIngestRequest,
    background_tasks: BackgroundTasks,
):
    """Trigger a full re-ingestion of all paper sources.

    Pass `reset_collection: true` when you have switched embedding models and
    need to wipe the existing vectors before re-ingesting.
    """
    if _ingestion_status["running"]:
        raise HTTPException(status_code=409, detail="Ingestion already in progress")

    entrez_email = os.getenv("ENTREZ_EMAIL", "")
    chroma_path = os.getenv("CHROMA_DB_PATH", "../data/chroma_db")
    guidelines_path = os.getenv("GUIDELINES_DIR", "../data/guidelines")
    figures_dir = os.getenv("FIGURES_DIR", "../data/figures")

    if not entrez_email:
        raise HTTPException(status_code=400, detail="ENTREZ_EMAIL must be set in .env")

    kwargs = {
        "pubmed_max": request.pubmed_max,
        "semantic_scholar_max": request.semantic_scholar_max,
        "pmc_max": request.pmc_max,
        "openalex_max": request.openalex_max,
        "high_evidence_max": request.high_evidence_max,
        "unpaywall_enrich": request.unpaywall_enrich,
        "reset_collection": request.reset_collection,
    }

    background_tasks.add_task(
        _run_ingestion,
        chroma_path, entrez_email, guidelines_path, figures_dir, kwargs, "full"
    )
    return {"status": "started", "message": "Full ingestion running in background"}


@router.post("/ingest/incremental")
async def trigger_incremental_ingestion(
    request: IncrementalIngestRequest,
    background_tasks: BackgroundTasks,
):
    """Trigger an incremental ingestion — only papers published in the last N days.

    Much faster than a full run (~2-5 min vs 20-40 min). Designed for weekly
    scheduled updates. Does NOT reset the collection.
    """
    if _ingestion_status["running"]:
        raise HTTPException(status_code=409, detail="Ingestion already in progress")

    entrez_email = os.getenv("ENTREZ_EMAIL", "")
    chroma_path = os.getenv("CHROMA_DB_PATH", "../data/chroma_db")
    guidelines_path = os.getenv("GUIDELINES_DIR", "../data/guidelines")
    figures_dir = os.getenv("FIGURES_DIR", "../data/figures")

    if not entrez_email:
        raise HTTPException(status_code=400, detail="ENTREZ_EMAIL must be set in .env")

    min_date = _make_min_date(request.days_back)

    kwargs = {
        "pubmed_max": request.pubmed_max,
        "semantic_scholar_max": 0,   # SS is unreliable; skip for incremental
        "pmc_max": 0,                 # PMC full-text doesn't support date filtering well
        "openalex_max": request.openalex_max,
        "high_evidence_max": 15,
        "unpaywall_enrich": request.unpaywall_enrich,
        "reset_collection": False,
        "min_date": min_date,
    }

    background_tasks.add_task(
        _run_ingestion,
        chroma_path, entrez_email, guidelines_path, figures_dir, kwargs, "incremental"
    )
    return {
        "status": "started",
        "message": f"Incremental ingestion running (papers since {min_date})",
        "min_date": min_date,
    }


@router.get("/ingest/status")
async def ingestion_status():
    """Return the current ingestion status and the result of the last run."""
    return _ingestion_status
