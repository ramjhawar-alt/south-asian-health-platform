# South Asian Health

Evidence-first health education platform focused on South Asian cardiometabolic risk.

**Live site:** [https://south-asian-health.vercel.app](https://south-asian-health.vercel.app)  
**Status:** Active build in progress - features and methodology are still being iterated.

## Why this project exists

Most consumer health tools are tuned to general or Western cohorts and rarely explain what makes South Asian risk patterns different.  
This project was built to close that gap with transparent, source-grounded tools that are easier for patients and families to use before and between clinician visits.

## What it does

- **Research Q&A:** asks health questions over a curated literature base and returns cited answers.
- **Risk Assessment:** computes a South Asian-focused educational risk snapshot with transparent logic.
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

## Key docs

- Risk methodology: `docs/RISK_METHODOLOGY.md`
- Simulator methodology: `docs/SIMULATOR_METHODOLOGY.md`
- Version history: `docs/VERSION_HISTORY.md`

## Disclaimer

This platform is for educational and research use only. It is not a diagnosis tool or a substitute for professional medical care.
