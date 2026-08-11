"""
Chat API route: RAG-powered Q&A with streaming and citation output.
Uses Groq for LLM and local deterministic embeddings.

When local corpus retrieval returns low confidence (top rerank score < 0.35),
the endpoint acts as an MCP client, connecting to mcp_pubmed_server.py to
fetch live PubMed results and fold them into the context before generation.
"""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from groq import AsyncGroq
from mcp import ClientSession, StdioServerParameters, stdio_client
from pydantic import BaseModel

from rag.llm import stream_answer
from rag.retrieval import format_context, retrieve

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[ChatMessage] = []
    user_context: str | None = None


class Citation(BaseModel):
    ref: int
    title: str
    authors: str
    year: str
    doi: str
    source: str
    evidence_level: str = "primary"
    evidence_label: str = "Primary Study"


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]


def get_groq_key() -> str:
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")
    return key


def get_chroma_path() -> str:
    return os.getenv("CHROMA_DB_PATH", "../data/chroma_db")


_MCP_PUBMED_SERVER = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "mcp_pubmed_server.py")
)
_LIVE_SEARCH_LOG = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "live_search_log.jsonl")
)


async def _call_pubmed_mcp(query: str, max_results: int = 4) -> list[dict]:
    """Connect to mcp_pubmed_server.py as an MCP client and run live_pubmed_search.

    Spawns the server as a subprocess via stdio transport. Total budget is 15s
    (subprocess startup ~1-2s + PubMed API call ~1-3s). Returns [] on any failure
    so callers always degrade gracefully.

    mcp's get_default_environment() strips most env vars for security, so we
    pass the ones the server actually needs: ENTREZ_EMAIL plus SSL cert vars
    that biopython's urllib relies on for HTTPS to NCBI.
    """
    _SSL_KEYS = {"SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE",
                 "CURL_CA_BUNDLE", "PYTHONPATH", "PYTHONHOME"}
    _NEEDED = {"ENTREZ_EMAIL"} | _SSL_KEYS
    passthrough = {k: v for k, v in os.environ.items() if k in _NEEDED}

    params = StdioServerParameters(
        command=sys.executable,
        args=[_MCP_PUBMED_SERVER],
        env=passthrough,
    )

    async def _do() -> list[dict]:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(
                    "live_pubmed_search",
                    {"query": query, "max_results": max_results},
                )
                # mcp v2: structured tool results land in structured_content.result
                sc = result.structured_content or {}
                papers = sc.get("result", [])
                if papers:
                    return papers
                # Fallback: older TextContent path
                for content in result.content or []:
                    text = getattr(content, "text", None)
                    if text:
                        return json.loads(text)
        return []

    try:
        return await asyncio.wait_for(_do(), timeout=15.0)
    except asyncio.TimeoutError:
        print(f"[live_search] timed out for query: {query!r}")
    except Exception as e:
        print(f"[live_search] MCP call failed: {e}")
    return []


def _papers_to_hits(papers: list[dict]) -> list[dict]:
    """Convert raw PubMed paper dicts to the hit format expected by format_context()."""
    hits = []
    for p in papers:
        abstract = (p.get("abstract") or "").strip()
        if not abstract:
            continue
        hits.append({
            "text": abstract[:1200],
            "meta": {
                "title": (p.get("title") or "")[:500],
                "authors": (p.get("authors") or "")[:200],
                "year": p.get("year", ""),
                "source": "PubMed",
                "doi": p.get("doi", ""),
                "pmid": p.get("pmid", ""),
                "evidence_level": "live_search",
                "pub_types": p.get("evidence_level", ""),
                "has_figures": False,
                "figures_dir": "",
            },
            "score": 0.5,
            "collection": "live_search",
        })
    return hits


def _log_live_search(query: str, papers: list[dict]) -> None:
    """Append to the live search log — signals which topics are thin in the corpus.

    The KB-build job can read this log to prioritise topics for the next
    ingestion run. Format: one JSON object per line.
    """
    try:
        os.makedirs(os.path.dirname(_LIVE_SEARCH_LOG), exist_ok=True)
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "query": query,
            "results_found": len(papers),
            "pmids": [p.get("pmid", "") for p in papers if p.get("pmid")],
            "titles": [p.get("title", "")[:100] for p in papers],
        }
        with open(_LIVE_SEARCH_LOG, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        print(f"[live_search] log write failed: {e}")


@router.post("/chat")
async def chat_stream(request: ChatRequest):
    """
    Streaming chat endpoint. Returns SSE stream with answer tokens,
    then a final JSON citations event.
    """
    api_key = get_groq_key()
    chroma_path = get_chroma_path()

    groq_async = AsyncGroq(api_key=api_key)

    retrieve_query = (request.question or "").strip()
    if request.user_context and str(request.user_context).strip():
        brief = str(request.user_context).strip()[:500]
        retrieve_query = f"{retrieve_query}\n\n[User risk screener profile (for relevance): {brief}]"

    hits, info = retrieve(
        query=retrieve_query,
        chroma_db_path=chroma_path,
        top_k=10,
    )

    context, citations = format_context(hits)
    history = [{"role": m.role, "content": m.content} for m in request.history]
    low_confidence = bool(info.get("low_confidence", False))

    async def generate():
        try:
            yield f"data: {json.dumps({'type': 'retrieval_info', 'info': info})}\n\n"

            # ── Live PubMed fallback ──────────────────────────────────────────
            # When local corpus confidence is low, reach out to PubMed for fresh
            # results and fold up to 4 papers into the context before generation.
            active_context = context
            active_citations = citations
            live_fired = False

            if low_confidence:
                yield f"data: {json.dumps({'type': 'live_search', 'status': 'started'})}\n\n"
                live_papers = await _call_pubmed_mcp(retrieve_query, max_results=4)
                if live_papers:
                    live_hits = _papers_to_hits(live_papers)
                    _log_live_search(retrieve_query, live_papers)
                    active_context, active_citations = format_context(hits + live_hits)
                    live_fired = True
                    yield f"data: {json.dumps({'type': 'live_search', 'status': 'done', 'count': len(live_hits)})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'live_search', 'status': 'no_results'})}\n\n"
            # ─────────────────────────────────────────────────────────────────

            full_answer = ""
            async for token in stream_answer(
                context=active_context,
                question=request.question,
                async_groq_client=groq_async,
                conversation_history=history,
                low_confidence=low_confidence and not live_fired,
                user_context=request.user_context,
            ):
                full_answer += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            yield f"data: {json.dumps({'type': 'citations', 'citations': active_citations})}\n\n"

            # Generate 3 follow-up question chips
            try:
                if request.user_context and str(request.user_context).strip():
                    _uc = str(request.user_context).strip()
                    if len(_uc) > 450:
                        _uc = _uc[:450] + "…"
                    followup_user_content = (
                        f"User profile (in-app screener, educational; tailor follow-up ideas when useful):\n{_uc}\n\n"
                        f"Question: {request.question}\nAnswer summary: {full_answer[:600]}"
                    )
                else:
                    followup_user_content = (
                        f"Question: {request.question}\nAnswer summary: {full_answer[:600]}"
                    )
                followup_resp = await groq_async.chat.completions.create(
                    model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are helping non-medical users. "
                                "Given a question and a plain-language research-based answer, "
                                "propose exactly 3 short follow-up questions they might ask next. "
                                "Everyday wording, no jargon, each under 12 words. "
                                "Return ONLY a JSON array of 3 strings, nothing else. "
                                'Example: ["Question one?", "Question two?", "Question three?"]'
                            ),
                        },
                        {
                            "role": "user",
                            "content": followup_user_content,
                        },
                    ],
                    temperature=0.4,
                    max_tokens=120,
                )
                raw = followup_resp.choices[0].message.content or "[]"
                # Strip markdown code fences if present
                raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
                follow_ups = json.loads(raw)
                if isinstance(follow_ups, list):
                    follow_ups = [str(q) for q in follow_ups[:3]]
                    yield f"data: {json.dumps({'type': 'follow_ups', 'questions': follow_ups})}\n\n"
            except Exception:
                pass  # Follow-ups are optional; never block the main response

            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/chat/health")
async def chat_health():
    chroma_path = get_chroma_path()
    try:
        import chromadb
        from rag.ingest import COLLECTION_NAME
        client = chromadb.PersistentClient(path=chroma_path)
        col = client.get_or_create_collection(COLLECTION_NAME)
        count = col.count()
        return {"status": "ok", "document_chunks": count}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
