"""
Knowledge Base API routes.
POST /api/kb/build  — trigger full knowledge base build (background task)
GET  /api/kb/status — page count, last built timestamp, collection size
"""
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException

router = APIRouter()

# Simple in-memory build status
_kb_status: dict = {
    "state": "idle",      # idle | building | done | error
    "started_at": None,
    "finished_at": None,
    "last_result": None,
    "error": None,
}


def _get_kb_dir() -> str:
    return os.getenv("KNOWLEDGE_BASE_PATH", "../data/knowledge_base")


def _get_chroma_path() -> str:
    return os.getenv("CHROMA_DB_PATH", "../data/chroma_db")


def _run_build(skip_existing: bool = False) -> None:
    global _kb_status
    _kb_status["state"] = "building"
    _kb_status["error"] = None
    try:
        from rag.knowledge_base import build_knowledge_base
        result = build_knowledge_base(
            chroma_db_path=_get_chroma_path(),
            kb_dir_path=_get_kb_dir(),
            skip_existing=skip_existing,
        )
        _kb_status["state"] = "done"
        _kb_status["last_result"] = result
        _kb_status["finished_at"] = datetime.now(timezone.utc).isoformat()
    except Exception as e:
        _kb_status["state"] = "error"
        _kb_status["error"] = str(e)
        _kb_status["finished_at"] = datetime.now(timezone.utc).isoformat()


@router.post("/kb/build")
async def build_kb(background_tasks: BackgroundTasks, skip_existing: bool = False):
    """Trigger a knowledge base build in the background.

    Synthesizes structured markdown pages from the ingested paper corpus
    and indexes them in ChromaDB for hybrid retrieval.
    Estimated time: 3–6 minutes (one Groq call per page).

    Args:
        skip_existing: If true, skip pages whose file already exists. Use this
            to resume after a rate-limit failure without rebuilding pages that
            already succeeded.
    """
    if _kb_status["state"] == "building":
        raise HTTPException(status_code=409, detail="Knowledge base build already in progress.")

    _kb_status["state"] = "building"
    _kb_status["started_at"] = datetime.now(timezone.utc).isoformat()
    _kb_status["finished_at"] = None
    background_tasks.add_task(_run_build, skip_existing=skip_existing)
    return {
        "status": "started",
        "message": "Knowledge base build running in background.",
        "skip_existing": skip_existing,
    }


@router.get("/kb/status")
async def kb_status():
    """Return current knowledge base status: build state, page count, collection size."""
    kb_dir = Path(_get_kb_dir())

    # Count markdown pages
    page_count = len(list(kb_dir.rglob("*.md"))) if kb_dir.exists() else 0

    # Count KB collection chunks
    kb_chunks = 0
    try:
        import chromadb
        from rag.knowledge_base import KB_COLLECTION_NAME
        from rag.ingest import get_chroma_client, get_collection
        client = get_chroma_client(_get_chroma_path())
        kb_col = get_collection(client, KB_COLLECTION_NAME)
        kb_chunks = kb_col.count()
    except Exception:
        pass

    return {
        "build_state": _kb_status["state"],
        "started_at": _kb_status.get("started_at"),
        "finished_at": _kb_status.get("finished_at"),
        "last_result": _kb_status.get("last_result"),
        "error": _kb_status.get("error"),
        "page_count": page_count,
        "kb_chunks_indexed": kb_chunks,
    }
