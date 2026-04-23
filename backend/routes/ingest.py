"""
Ingest API route: admin endpoint to trigger research paper ingestion.
No API key needed for ingestion — embeddings are local (sentence-transformers).
"""
import os

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from rag.ingest import run_full_ingestion

router = APIRouter()
_ingestion_status = {"running": False, "last_result": None}


class IngestRequest(BaseModel):
    pubmed_max: int = 50
    semantic_scholar_max: int = 50
    pmc_max: int = 20
    high_evidence_max: int = 30


@router.post("/ingest/run")
async def trigger_ingestion(request: IngestRequest, background_tasks: BackgroundTasks):
    if _ingestion_status["running"]:
        raise HTTPException(status_code=409, detail="Ingestion already in progress")

    entrez_email = os.getenv("ENTREZ_EMAIL", "")
    chroma_path = os.getenv("CHROMA_DB_PATH", "../data/chroma_db")
    guidelines_path = os.getenv("GUIDELINES_DIR", "../data/guidelines")

    if not entrez_email:
        raise HTTPException(status_code=400, detail="ENTREZ_EMAIL must be set in .env")

    def run():
        _ingestion_status["running"] = True
        try:
            result = run_full_ingestion(
                chroma_db_path=chroma_path,
                entrez_email=entrez_email,
                pubmed_max=request.pubmed_max,
                semantic_scholar_max=request.semantic_scholar_max,
                pmc_max=request.pmc_max,
                high_evidence_max=request.high_evidence_max,
                guidelines_path=guidelines_path,
            )
            _ingestion_status["last_result"] = result
        except Exception as e:
            _ingestion_status["last_result"] = {"error": str(e)}
        finally:
            _ingestion_status["running"] = False

    background_tasks.add_task(run)
    return {"status": "started", "message": "Ingestion running in background"}


@router.get("/ingest/status")
async def ingestion_status():
    return _ingestion_status
