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

MCP server (backend/mcp_server.py)   ← same retrieval pipeline, no generation step
  -> Claude Desktop / Claude Code / any MCP client
      -> search_south_asian_health_literature(query) → evidence + citations
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

If pnpm still misbehaves, try removing **`ENABLE_EXPERIMENTAL_COREPACK`** from the Vercel project env (some community reports prefer the default Corepack path).

### 3) MCP server (optional — for Claude Desktop / Claude Code)

The MCP server exposes the same hybrid retrieval pipeline as a standalone tool any
MCP client can call directly — no Next.js frontend or Groq generation step needed.

```bash
cd backend
source venv/bin/activate

# Interactive inspector — opens a browser UI for testing queries
mcp dev mcp_server.py

# Or run directly (stdio transport — used by MCP clients like Claude Desktop)
python mcp_server.py
```

**Option A — auto-install into Claude Desktop** (easiest):

```bash
cd backend && source venv/bin/activate
mcp install mcp_server.py --env-file .env
```

This writes the config entry into
`~/Library/Application Support/Claude/claude_desktop_config.json` automatically.
Restart Claude Desktop after running it.

**Option B — manual Claude Desktop config**
(`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "south-asian-health": {
      "command": "/absolute/path/to/backend/venv/bin/python",
      "args": ["/absolute/path/to/backend/mcp_server.py"],
      "env": {
        "CHROMA_DB_PATH": "/absolute/path/to/data/chroma_db",
        "GROQ_API_KEY": "your-groq-api-key",
        "VOYAGE_API_KEY": "your-voyage-api-key"
      }
    }
  }
}
```

Replace the `/absolute/path/to/` placeholders with real paths on your machine
(e.g. `/Users/yourname/south asian health/backend`). Restart Claude Desktop after saving.

**Claude Code:** use the same config block, or `/mcp add` in the Claude Code CLI.

The server exposes one tool: **`search_south_asian_health_literature(query, top_k=8)`**.
The calling model receives verbatim evidence passages with citation metadata and does its
own synthesis — no second LLM call, no Groq dependency in the retrieval path.

## Key docs

- Risk methodology: `docs/RISK_METHODOLOGY.md`
- Simulator methodology: `docs/SIMULATOR_METHODOLOGY.md`
- Version history: `docs/VERSION_HISTORY.md`

## Disclaimer

This platform is for educational and research use only. It is not a diagnosis tool or a substitute for professional medical care.
