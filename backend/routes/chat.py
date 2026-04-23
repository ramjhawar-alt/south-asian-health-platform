"""
Chat API route: RAG-powered Q&A with streaming and citation output.
Uses Groq for LLM and local sentence-transformers for embeddings.
"""
import json
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from groq import AsyncGroq
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


@router.post("/chat")
async def chat_stream(request: ChatRequest):
    """
    Streaming chat endpoint. Returns SSE stream with answer tokens,
    then a final JSON citations event.
    """
    api_key = get_groq_key()
    chroma_path = get_chroma_path()

    groq_async = AsyncGroq(api_key=api_key)

    hits, info = retrieve(
        query=request.question,
        chroma_db_path=chroma_path,
        top_k=10,
    )

    context, citations = format_context(hits)
    history = [{"role": m.role, "content": m.content} for m in request.history]
    low_confidence = bool(info.get("low_confidence", False))

    async def generate():
        try:
            yield f"data: {json.dumps({'type': 'retrieval_info', 'info': info})}\n\n"

            full_answer = ""
            async for token in stream_answer(
                context=context,
                question=request.question,
                async_groq_client=groq_async,
                conversation_history=history,
                low_confidence=low_confidence,
            ):
                full_answer += token
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            yield f"data: {json.dumps({'type': 'citations', 'citations': citations})}\n\n"

            # Generate 3 follow-up question chips
            try:
                followup_resp = await groq_async.chat.completions.create(
                    model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a South Asian health assistant. "
                                "Given a question and answer, produce exactly 3 concise follow-up questions "
                                "the user might want to ask next. Each must be under 12 words. "
                                "Return ONLY a JSON array of 3 strings, nothing else. "
                                'Example: ["Question one?", "Question two?", "Question three?"]'
                            ),
                        },
                        {
                            "role": "user",
                            "content": f"Question: {request.question}\nAnswer summary: {full_answer[:600]}",
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
