# South Asian Health

Evidence-first health education platform focused on South Asian cardiometabolic risk.

**Live site:** [https://south-asian-health.vercel.app](https://south-asian-health.vercel.app)  
**Status:** Active build in progress - features and methodology are still being iterated.

## Why this project exists

Most consumer health tools are tuned to general or Western cohorts and rarely explain what makes South Asian risk patterns different.  
This project was built to close that gap with transparent, source-grounded tools that are easier for patients and families to use before and between clinician visits.

## What it does

- **Research Q&A:** asks health questions over a curated literature base and returns cited answers.
- **Risk Assessment:** South Asian-focused educational risk snapshot (gated on the public site until launch; enable locally or on Vercel with server env `ASSESS_ENABLED=true`, not a `NEXT_PUBLIC_*` variable).
- **Simulator:** visual, educational trend simulation for common cardiometabolic scenarios.
- **Conditions + Resources:** plain-language explainers and curated references.

## Architecture

```text
Next.js frontend (Vercel)
  -> FastAPI backend (Render)
      -> Hybrid retrieval (dense + BM25 + rerank)
          -> Groq LLM response generation with citations
              -> ChromaDB persistence + ingestion pipeline
```

## Stack

- **Frontend:** Next.js 16, TypeScript, Tailwind CSS
- **Backend:** FastAPI, Python, Uvicorn
- **LLM:** Groq (`llama-3.3-70b-versatile`)
- **Retrieval:** ChromaDB + BM25 + FlashRank reranking
- **Ingestion:** PubMed + Semantic Scholar APIs
- **Visualization:** Recharts + custom UI components

## Local development

### 1) Backend

```bash
cd backend
cp .env.example .env
# set: GROQ_API_KEY, ENTREZ_EMAIL, CORS_ORIGINS
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2) Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Optional: create `frontend/.env.local` and set `ASSESS_ENABLED=true` to enable the full Risk Assessment UI while developing. On Vercel, add the same **server** environment variable (not `NEXT_PUBLIC_*`) only when you want the tool live publicly.

### Vercel (frontend)

**Root Directory `frontend`:** Next.js lives under `frontend/` instead of the repo root (unlike many single-package templates). Set **Root Directory** so installs and builds run beside the app and `pnpm-lock.yaml`.

**Root `package.json`:** a minimal root manifest with only `"packageManager": "pnpm@9.15.9"` helps Vercel Corepack at the **Git** root, avoiding `pnpm install` exit **1** or the lockfile being ignored when the dashboard root is not the app folder alone.

Use **one** setup only (mixing them breaks `pnpm install`):

1. **Settings** → search **`root`** → **Root Directory** = **`frontend`** → Save.
2. Leave **Install Command** and **Build Command** on defaults (override toggles off). Vercel runs **`pnpm install`** / **`pnpm run build`** inside `frontend/`.

**Do not** commit a root `vercel.json` with `pnpm install --dir frontend` while Root Directory is `frontend`: Vercel still reads that file from the repo root, and the command resolves to `frontend/frontend`, so install exits with **1**. Domains and preview URLs are unrelated.

`frontend/vercel.json` intentionally sets the default pnpm install and build commands so stale dashboard or cached project settings cannot resurrect `pnpm install --dir frontend`.

If pnpm still misbehaves, try removing **`ENABLE_EXPERIMENTAL_COREPACK`** from the Vercel project env (some community reports prefer the default Corepack path).

## Key docs

- Risk methodology: `docs/RISK_METHODOLOGY.md`
- Simulator methodology: `docs/SIMULATOR_METHODOLOGY.md`
- Version history: `docs/VERSION_HISTORY.md`

## Disclaimer

This platform is for educational and research use only. It is not a diagnosis tool or a substitute for professional medical care.
