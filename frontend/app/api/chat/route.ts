/**
 * Research Q&A chat endpoint — Vercel Edge function.
 *
 * When QDRANT_URL + QDRANT_API_KEY + VOYAGE_API_KEY are set:
 *   Full RAG pipeline: embed query → Qdrant vector search → Groq generation with citations
 *
 * When those vars are missing (fallback):
 *   Calls Groq directly with a South Asian health system prompt (no citations)
 */

import { NextRequest } from "next/server";

export const runtime = "edge";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const VOYAGE_EMBED_URL = "https://api.voyageai.com/v1/embeddings";
const QDRANT_COLLECTION = "south_asian_health";

const SYSTEM_PROMPT_BASE = `You are a specialized South Asian health assistant grounded in peer-reviewed scientific research and clinical guidelines. Your role is to answer questions about health topics particularly relevant to South Asian populations (people with ancestry from India, Pakistan, Bangladesh, Sri Lanka, Nepal, Bhutan, Maldives, and neighboring regions).

Key principles:
1. **Evidence-based only**: Base all answers on the provided research excerpts. Cite them as [1], [2], etc.
2. **Evidence hierarchy**: Cite guideline-level and meta-analysis evidence first. Frame single-study findings as "one study found" not established fact.
3. **South Asian specificity**: Always highlight where South Asian populations differ from general guidelines:
   - BMI thresholds: ≥23 kg/m² = overweight, ≥27.5 kg/m² = obese (WHO Asia-Pacific)
   - Higher cardiometabolic risk at lower body weights than European populations
   - Earlier onset of type 2 diabetes (often a decade earlier)
   - Waist circumference cutoffs: men ≥90 cm, women ≥80 cm
   - When evidence is from a non-South-Asian population, flag it.
4. **Structured responses**:
   - **Direct answer** (1-2 sentences)
   - **Evidence summary** (what research shows, citing [N])
   - **South Asian-specific considerations** (if applicable)
   - **Clinical note** (brief reminder about professional medical advice)
5. **Honest uncertainty**: If the evidence is limited, say so. Never fabricate citations or numbers.`;

const SYSTEM_PROMPT_NO_RAG = SYSTEM_PROMPT_BASE + `

Note: You are answering from your training knowledge since the literature database is not available. Do not hallucinate citations.`;

const USER_CONTEXT_ADDENDUM = `\n\nPATIENT CONTEXT (from in-app risk screener — use to personalize relevance, educational only):\n{user_context}`;

// ── Voyage AI embedding ───────────────────────────────────────────────────────

async function embedQuery(query: string, voyageKey: string): Promise<number[] | null> {
  try {
    const resp = await fetch(VOYAGE_EMBED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${voyageKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [query],
        model: "voyage-3.5",
        input_type: "query",
      }),
    });
    if (!resp.ok) return null;
    const json = await resp.json() as { data: { embedding: number[] }[] };
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ── Qdrant vector search ──────────────────────────────────────────────────────

interface QdrantHit {
  id: string;
  score: number;
  payload: {
    text: string;
    title: string;
    authors: string;
    year: string;
    source: string;
    doi: string;
    pmid: string;
    evidence_level: string;
    evidence_label?: string;
    has_figures: boolean;
    figures_dir: string;
  };
}

async function qdrantSearch(
  vector: number[],
  qdrantUrl: string,
  qdrantKey: string,
  topK = 8,
): Promise<QdrantHit[]> {
  try {
    const url = `${qdrantUrl}/collections/${QDRANT_COLLECTION}/points/search`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": qdrantKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vector,
        limit: topK,
        with_payload: true,
        score_threshold: 0.3,
      }),
    });
    if (!resp.ok) return [];
    const json = await resp.json() as { result: QdrantHit[] };
    return json.result ?? [];
  } catch {
    return [];
  }
}

// ── Evidence label map ────────────────────────────────────────────────────────

const EVIDENCE_LABELS: Record<string, string> = {
  guideline: "Clinical Guideline",
  meta_analysis: "Meta-Analysis / Systematic Review",
  rct: "Randomized Controlled Trial",
  review: "Review",
  primary: "Primary Study",
  knowledge_base: "Synthesized Evidence",
  live_search: "Live Search",
};

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Research service is not configured." })}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } }
    );
  }

  let body: { question: string; history?: { role: string; content: string }[]; user_context?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Invalid request." })}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } }
    );
  }

  const { question, history = [], user_context } = body;

  const voyageKey = process.env.VOYAGE_API_KEY ?? "";
  const qdrantUrl = (process.env.QDRANT_URL ?? "").replace(/\/$/, "");
  const qdrantKey = process.env.QDRANT_API_KEY ?? "";

  const hasRAG = Boolean(voyageKey && qdrantUrl && qdrantKey);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: unknown) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let hits: QdrantHit[] = [];
      let lowConfidence = false;

      if (hasRAG) {
        // Step 1: embed query
        const vector = await embedQuery(question, voyageKey);

        if (vector) {
          // Step 2: Qdrant search
          hits = await qdrantSearch(vector, qdrantUrl, qdrantKey);
          lowConfidence = hits.length === 0 || (hits[0]?.score ?? 0) < 0.45;
        } else {
          lowConfidence = true;
        }
      }

      emit({
        type: "retrieval_info",
        info: {
          expanded_queries: [question],
          top_score: hits[0]?.score ?? 0,
          low_confidence: lowConfidence,
          num_candidates: hits.length,
        },
      });

      // Build system prompt
      let systemContent = hasRAG ? SYSTEM_PROMPT_BASE : SYSTEM_PROMPT_NO_RAG;
      if (user_context?.trim()) {
        systemContent += USER_CONTEXT_ADDENDUM.replace("{user_context}", user_context.trim().slice(0, 600));
      }

      // Build context from hits
      let contextBlock = "";
      if (hits.length > 0) {
        const parts = hits.map((hit, i) => {
          const level = hit.payload.evidence_level ?? "primary";
          const label = EVIDENCE_LABELS[level] ?? "Primary Study";
          return `[${i + 1}] (${label}) ${hit.payload.text}`;
        });
        contextBlock = `\n\nRESEARCH CONTEXT (cite as [N]):\n${parts.join("\n\n")}`;
      }

      const messages: { role: string; content: string }[] = [
        { role: "system", content: systemContent },
        ...history.slice(-6),
        { role: "user", content: question + contextBlock },
      ];

      let fullContent = "";

      try {
        const groqResp = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages,
            temperature: 0.2,
            max_tokens: 1500,
            stream: true,
          }),
        });

        if (!groqResp.ok) {
          const errText = await groqResp.text();
          emit({ type: "error", message: `API error: ${errText.slice(0, 200)}` });
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        const reader = groqResp.body?.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        if (reader) {
          outer: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              const data = trimmed.slice(6);
              if (data === "[DONE]") break outer;
              try {
                const chunk = JSON.parse(data);
                const content: string | undefined = chunk.choices?.[0]?.delta?.content;
                if (content) {
                  fullContent += content;
                  emit({ type: "token", content });
                }
              } catch { /* skip malformed chunks */ }
            }
          }
        }
      } catch (err) {
        emit({
          type: "error",
          message: `Connection error: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }

      // Citations from Qdrant hits
      const citations = hits.map((hit, i) => {
        const level = hit.payload.evidence_level ?? "primary";
        return {
          ref: i + 1,
          title: hit.payload.title,
          authors: hit.payload.authors,
          year: hit.payload.year,
          doi: hit.payload.doi,
          source: hit.payload.source,
          evidence_level: level,
          evidence_label: EVIDENCE_LABELS[level] ?? "Primary Study",
          has_figures: hit.payload.has_figures,
          figures_dir: hit.payload.figures_dir,
        };
      });
      emit({ type: "citations", citations });

      // Follow-up chips
      try {
        const fuResp = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
              {
                role: "system",
                content:
                  'You are helping non-medical users. Given a question and a plain-language research-based answer, propose exactly 3 short follow-up questions they might ask next. Everyday wording, no jargon, each under 12 words. Return ONLY a JSON array of 3 strings, nothing else. Example: ["Question one?", "Question two?", "Question three?"]',
              },
              {
                role: "user",
                content: `Question: ${question}\nAnswer summary: ${fullContent.slice(0, 600)}`,
              },
            ],
            temperature: 0.4,
            max_tokens: 120,
          }),
        });
        const fuJson = await fuResp.json();
        const raw = ((fuJson.choices?.[0]?.message?.content as string) ?? "[]")
          .trim()
          .replace(/```json|```/g, "")
          .trim();
        const followUps: unknown = JSON.parse(raw);
        if (Array.isArray(followUps) && followUps.length > 0) {
          emit({ type: "follow_ups", questions: (followUps as string[]).slice(0, 3) });
        }
      } catch { /* follow-ups are optional */ }

      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
