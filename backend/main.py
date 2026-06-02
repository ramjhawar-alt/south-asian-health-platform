"""
South Asian Health Platform - FastAPI backend entry point.
"""
import os
import ssl
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import certifi
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# Fix macOS SSL certificate verification for urllib (used by Biopython/Entrez)
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
ssl._create_default_https_context = ssl.create_default_context

from routes.chat import router as chat_router
from routes.figures import router as figures_router
from routes.ingest import router as ingest_router
from routes.kb import router as kb_router
from routes.papers import router as papers_router
from routes.simulate import router as simulate_router


# ── Daily KB auto-build scheduler ─────────────────────────────────────────────

def _kb_build_job() -> None:
    """Background job: build any missing KB pages. Runs daily at 00:05 UTC."""
    groq_api_key = os.getenv("GROQ_API_KEY", "")
    chroma_path = os.getenv("CHROMA_DB_PATH", "../data/chroma_db")
    kb_dir = os.getenv("KNOWLEDGE_BASE_PATH", "../data/knowledge_base")

    # Resolve relative paths from backend/
    backend_dir = Path(__file__).resolve().parent
    if not Path(chroma_path).is_absolute():
        chroma_path = str(backend_dir / chroma_path)
    if not Path(kb_dir).is_absolute():
        kb_dir = str(backend_dir / kb_dir)

    if not groq_api_key:
        print("[KB scheduler] Skipping: GROQ_API_KEY not set.")
        return

    print("[KB scheduler] Starting daily KB build (skip_existing=True)...")
    try:
        from rag.knowledge_base import build_knowledge_base
        result = build_knowledge_base(
            chroma_db_path=chroma_path,
            kb_dir_path=kb_dir,
            groq_api_key=groq_api_key,
            skip_existing=True,
        )
        print(
            f"[KB scheduler] Done — built {result['pages_built']}, "
            f"skipped {result['pages_skipped']}, "
            f"errors {len(result['errors'])}"
        )
    except Exception as e:
        print(f"[KB scheduler] Error: {e}")


def _start_scheduler() -> None:
    """Start APScheduler in a background thread — runs daily at 00:05 UTC."""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger

        scheduler = BackgroundScheduler(timezone="UTC")
        # 00:05 UTC daily — Groq's daily token quota resets at midnight UTC
        scheduler.add_job(
            _kb_build_job,
            CronTrigger(hour=0, minute=5, timezone="UTC"),
            id="kb_daily_build",
            replace_existing=True,
            misfire_grace_time=3600,  # Run even if server was down at trigger time (up to 1h late)
        )
        scheduler.start()
        print("[KB scheduler] Scheduled daily KB build at 00:05 UTC.")
    except ImportError:
        print("[KB scheduler] APScheduler not installed — skipping daily build.")
    except Exception as e:
        print(f"[KB scheduler] Failed to start: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("South Asian Health Platform API starting up...")
    # Start KB scheduler in a daemon thread so it doesn't block shutdown
    t = threading.Thread(target=_start_scheduler, daemon=True)
    t.start()
    yield
    print("Shutting down...")


app = FastAPI(
    title="South Asian Health Platform API",
    description=(
        "RAG-powered Q&A over South Asian health research, "
        "combined with Pulse Physiology Engine simulations."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

cors_origins_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000")
cors_origins = [o.strip() for o in cors_origins_raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router, prefix="/api", tags=["Chat"])
app.include_router(simulate_router, prefix="/api", tags=["Simulation"])
app.include_router(ingest_router, prefix="/api", tags=["Ingestion"])
app.include_router(kb_router, prefix="/api", tags=["Knowledge Base"])
app.include_router(figures_router, prefix="/api", tags=["Figures"])
app.include_router(papers_router, prefix="/api", tags=["Papers"])


@app.get("/")
async def root():
    return {
        "name": "South Asian Health Platform API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
