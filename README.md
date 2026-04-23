# South Asian Health Platform

An evidence-based health Q&A and physiology simulation platform tailored for South Asian populations.

## Features

- **Research Q&A** — Ask health questions and receive answers grounded in peer-reviewed literature from PubMed and Semantic Scholar, with inline citations. Uses hybrid RAG (dense vector search + BM25 + cross-encoder reranking).
- **Physiology Simulator** — Enter your health profile to model physiological outcomes using South Asian-calibrated risk equations (powered by the Pulse Physiology Engine when installed, with a validated mathematical fallback).

## Project Structure

```
/
├── frontend/       # Next.js 16, Tailwind CSS, Recharts
├── backend/        # FastAPI, ChromaDB, LangChain, OpenAI
├── data/
│   ├── chroma_db/  # Vector database (auto-created on ingest)
│   └── papers/     # PDF storage for manual ingestion
└── start.sh        # Development startup script
```

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY and ENTREZ_EMAIL
source venv/bin/activate   # or: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Ingest Research Papers

Once the backend is running and your `OPENAI_API_KEY` is set:

```bash
curl -X POST http://localhost:8000/api/ingest/run \
  -H "Content-Type: application/json" \
  -d '{"pubmed_max": 30, "semantic_scholar_max": 20}'
```

Monitor progress:
```bash
curl http://localhost:8000/api/ingest/status
```

This fetches ~750+ papers on South Asian health from PubMed and Semantic Scholar, chunks and embeds them, and stores them in ChromaDB. Ingestion takes 5–15 minutes depending on API rate limits.

## Environment Variables

### Backend (`backend/.env`)
| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for embeddings and GPT-4o |
| `ENTREZ_EMAIL` | Your email for NCBI PubMed API access (required by NCBI) |
| `CORS_ORIGINS` | Comma-separated allowed origins (default: `http://localhost:3000`) |
| `CHROMA_DB_PATH` | Path to ChromaDB persistence directory |

### Frontend (`frontend/.env.local`)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend URL (default: `http://localhost:8000`) |

## RAG Architecture

```
Query → Embed (text-embedding-3-large) → ChromaDB dense search (top 30)
                                       ↘
                                        BM25 keyword search (top 20)
                                         ↓
                                   RRF Merge → FlashRank rerank (top 8)
                                                      ↓
                                             GPT-4o with context + citations
```

## Physiology Simulator Scenarios

| Scenario | Description |
|----------|-------------|
| Cardiovascular Stress | 2-min graded exercise stress test (HR, BP, cardiac output) |
| Metabolic Syndrome Progression | 10-year BMI, glucose, HbA1c, CVD risk trajectory |
| Antihypertensive Treatment | 12-week BP response to treatment |
| Diabetes Risk Trajectory | 5-year T2DM risk and glucose progression |

### South Asian-Specific Calibrations
- BMI thresholds: ≥23 = overweight, ≥27.5 = obese (WHO Asia-Pacific)
- Framingham risk multiplied by 1.3× (South Asian amplification factor)
- Metabolic progression uses 1.35× South Asian risk multiplier
- T2DM risk uses 1.4× South Asian multiplier from UKPDS adaptation

### Pulse Engine (Optional)
Install the full Pulse Physiology Engine for higher-fidelity simulations:
```bash
pip install pulse-physiology
```
Download Pulse data files from [pulse.kitware.com](https://pulse.kitware.com). The platform automatically detects and uses the Pulse SDK if available, otherwise uses the validated mathematical model.

## API Documentation

FastAPI auto-generated docs available at [http://localhost:8000/docs](http://localhost:8000/docs).

### Key Endpoints
- `POST /api/chat` — Streaming SSE chat endpoint
- `GET /api/chat/health` — Returns document chunk count in database
- `GET /api/scenarios` — List available simulation scenarios
- `POST /api/simulate` — Run a physiology simulation
- `POST /api/ingest/run` — Trigger background paper ingestion
- `GET /api/ingest/status` — Check ingestion status

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS, Recharts |
| Backend | Python, FastAPI, Uvicorn |
| LLM | OpenAI GPT-4o |
| Embeddings | OpenAI text-embedding-3-large |
| Vector DB | ChromaDB (persistent) |
| Retrieval | BM25 (rank-bm25) + FlashRank reranker |
| Ingestion | Biopython (PubMed), Semantic Scholar API, PyMuPDF |
| Simulation | Pulse Physiology Engine v4.3.1 (Kitware) |

---

> **Disclaimer**: This platform is for educational and research purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment.
