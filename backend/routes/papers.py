"""
Papers API routes — browse the raw paper store (SQLite).
GET /api/papers           — paginated list, filterable by source / evidence_level
GET /api/papers/{id}      — single paper by PMID (numeric) or DOI; includes full text
"""
import os
import sqlite3
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()


def _db_path() -> str:
    papers_dir = os.getenv("PAPERS_DIR", "../data/papers")
    backend_dir = Path(__file__).resolve().parent.parent
    if not Path(papers_dir).is_absolute():
        papers_dir = str(backend_dir / papers_dir)
    return str(Path(papers_dir) / "papers.db")


def _open_db() -> sqlite3.Connection:
    path = _db_path()
    if not Path(path).exists():
        raise HTTPException(
            status_code=404,
            detail="Paper store not yet initialised. Run ingestion first.",
        )
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


@router.get("/papers")
async def list_papers(
    page:           int           = Query(1,   ge=1),
    page_size:      int           = Query(50,  ge=1, le=500),
    source:         Optional[str] = Query(None, description="Filter by source (e.g. 'PubMed')"),
    evidence_level: Optional[str] = Query(None, description="Filter by evidence_level"),
    q:              Optional[str] = Query(None, description="Search title (case-insensitive substring)"),
):
    """List all stored papers, paginated. Does not include abstract text (use the detail endpoint)."""
    conn = _open_db()
    try:
        clauses: list[str] = []
        params:  list      = []

        if source:
            clauses.append("source = ?")
            params.append(source)
        if evidence_level:
            clauses.append("evidence_level = ?")
            params.append(evidence_level)
        if q:
            clauses.append("title LIKE ?")
            params.append(f"%{q}%")

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

        total = conn.execute(f"SELECT COUNT(*) FROM papers {where}", params).fetchone()[0]
        offset = (page - 1) * page_size
        rows = conn.execute(
            f"""SELECT id, title, authors, year, source, doi, pmid,
                       evidence_level, pub_types, has_figures, figures_dir, ingested_at
                FROM papers {where}
                ORDER BY ingested_at DESC
                LIMIT ? OFFSET ?""",
            params + [page_size, offset],
        ).fetchall()

        return {
            "total":     total,
            "page":      page,
            "page_size": page_size,
            "papers":    [dict(r) for r in rows],
        }
    finally:
        conn.close()


@router.get("/papers/{paper_id}")
async def get_paper(paper_id: str):
    """Get a single paper by PMID (numeric) or DOI. Includes full abstract/text."""
    conn = _open_db()
    try:
        row = None
        if paper_id.isdigit():
            row = conn.execute("SELECT * FROM papers WHERE pmid = ?", (paper_id,)).fetchone()
        if row is None:
            row = conn.execute(
                "SELECT * FROM papers WHERE doi = ?", (paper_id.lower(),)
            ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Paper not found: {paper_id}")
        return dict(row)
    finally:
        conn.close()
