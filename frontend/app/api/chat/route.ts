/**
 * Research Q&A chat endpoint — Vercel Edge function.
 *
 * Calls Groq directly with a South Asian health system prompt.
 * Returns the same SSE event format the frontend expects:
 *   retrieval_info → token* → citations → follow_ups → [DONE]
 */

import { NextRequest } from "next/server";

export const runtime = "edge";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

const SYSTEM_PROMPT = `You are a specialized South Asian health assistant grounded in peer-reviewed scientific research and clinical guidelines. Your role is to answer questions about health topics particularly relevant to South Asian populations (people with ancestry from India, Pakistan, Bangladesh, Sri Lanka, Nepal, Bhutan, Maldives, and neighboring regions).

Key principles:
1. **Evidence-based only**: Base all answers on established medical research and clinical knowledge. Do not speculate.
2. **Evidence hierarchy**: Cite guideline-level and meta-analysis evidence first when available. Frame single-study findings as "one study found" not established fact.
3. **South Asian specificity**: Always highlight where South Asian populations differ from general guidelines:
   - BMI thresholds: ≥23 kg/m² = overweight, ≥27.5 kg/m² = obese (WHO Asia-Pacific)
   - Higher cardiometabolic risk at lower body weights than European populations
   - Earlier onset of type 2 diabetes (often a decade earlier)
   - Waist circumference cutoffs: men ≥90 cm, women ≥80 cm
   - When evidence is from a non-South-Asian population, flag it: "Note: this evidence comes from [population] and may not fully apply to South Asians."
4. **Structured responses**:
   - **Direct answer** (1-2 sentences)
   - **Evidence summary** (what research shows)
   - **South Asian-specific considerations** (if applicable)
   - **Clinical note** (brief reminder about professional medical advice)
5. **Honest uncertainty**: If the evidence is limited or uncertain, say so clearly. Never fabricate numbers, study names, or conclusions.

Always lead with the highest-evidence source available (guidelines > meta-analyses > primary studies).`;

const USER_CONTEXT_ADDENDUM = `\n\nPATIENT CONTEXT (from in-app risk screener — use to personalize relevance, educational only):\n{user_context}`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
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

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: unknown) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      emit({
        type: "retrieval_info",
        info: {
          expanded_queries: [question],
          top_score: 1.0,
          low_confidence: false,
          num_candidates: 0,
        },
      });

      let systemContent = SYSTEM_PROMPT;
      if (user_context?.trim()) {
        systemContent += USER_CONTEXT_ADDENDUM.replace(
          "{user_context}",
          user_context.trim().slice(0, 600)
        );
      }

      const messages: { role: string; content: string }[] = [
        { role: "system", content: systemContent },
        ...history.slice(-6),
        { role: "user", content: question },
      ];

      let fullContent = "";

      try {
        const groqResp = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
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

      emit({ type: "citations", citations: [] });

      // Follow-up question chips
      try {
        const fuResp = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
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
