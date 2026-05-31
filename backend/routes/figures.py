"""
Figure serving route.
GET /api/figures/{doi_hash}/{filename}

Serves extracted PDF figures (images) saved during ingestion.
Figures are stored at: data/figures/{doi_hash}/{filename}
"""
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff"}


def _get_figures_dir() -> str:
    return os.getenv("FIGURES_DIR", "../data/figures")


@router.get("/figures/{doi_hash}")
async def list_figures(doi_hash: str):
    """List all figures available for a paper (identified by doi_hash).

    Returns a list of {filename, url, caption} objects.
    The caption is the filename stem (e.g. 'page0_fig1') — actual captions
    are embedded in the image metadata stored separately.
    """
    if ".." in doi_hash or "/" in doi_hash or "\\" in doi_hash:
        raise HTTPException(status_code=400, detail="Invalid doi_hash.")

    figures_dir = Path(_get_figures_dir())
    paper_dir = figures_dir / doi_hash

    if not paper_dir.exists():
        return {"figures": []}

    figures = []
    for fig_file in sorted(paper_dir.iterdir()):
        if fig_file.suffix.lower() in IMAGE_EXTENSIONS:
            figures.append({
                "filename": fig_file.name,
                "url": f"/api/figures/{doi_hash}/{fig_file.name}",
            })

    return {"figures": figures}


@router.get("/figures/{doi_hash}/{filename}")
async def serve_figure(doi_hash: str, filename: str):
    """Serve an extracted figure image.

    doi_hash: MD5 hash (12 chars) of the paper's DOI, used as directory name.
    filename: e.g. page0_fig1.png
    """
    # Sanitize path components — no directory traversal
    if ".." in doi_hash or "/" in doi_hash or "\\" in doi_hash:
        raise HTTPException(status_code=400, detail="Invalid doi_hash.")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    figures_dir = Path(_get_figures_dir())
    fig_path = figures_dir / doi_hash / filename

    if not fig_path.exists():
        raise HTTPException(status_code=404, detail="Figure not found.")

    # Determine media type from extension
    ext = fig_path.suffix.lower()
    media_type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".tiff": "image/tiff",
    }
    media_type = media_type_map.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(fig_path),
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
