"""
South Asian Health Platform - FastAPI backend entry point.
"""
import os
import ssl
from contextlib import asynccontextmanager

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
from routes.ingest import router as ingest_router
from routes.simulate import router as simulate_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("South Asian Health Platform API starting up...")
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
