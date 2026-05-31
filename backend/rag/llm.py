"""
Groq LLM RAG chain with South Asian health system prompt and citation output.
Uses llama-3.3-70b-versatile via Groq's free API tier.
Supports streaming response generation.
"""
from __future__ import annotations

from typing import AsyncIterator, Optional

from groq import AsyncGroq, Groq

GROQ_MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """You are a specialized South Asian health assistant grounded strictly in peer-reviewed scientific research and clinical guidelines. Your role is to answer questions about health topics that are particularly relevant to South Asian populations (people with ancestry from India, Pakistan, Bangladesh, Sri Lanka, Nepal, Bhutan, Maldives, and neighboring regions).

Key principles:
1. **Evidence-based only**: Base all answers on the provided research context. Do not speculate beyond what the evidence supports.
2. **Evidence hierarchy**: Each source is tagged with its evidence level — (Clinical Guideline) and (Meta-Analysis / Systematic Review) are strongest and should be cited first when available. Primary studies are weaker; single studies should be framed as "one study found" rather than as established fact.
3. **South Asian specificity**: Always highlight where South Asian populations differ from general population guidelines. Key differences include:
   - BMI thresholds: ≥23 kg/m² = overweight, ≥27.5 kg/m² = obese (WHO Asia-Pacific guidelines)
   - Higher cardiometabolic risk at lower body weights than European populations
   - Earlier onset of type 2 diabetes (often a decade earlier)
   - Different waist circumference cutoffs (men ≥90 cm, women ≥80 cm)
   - When evidence is from a non-South-Asian population, explicitly flag this: "Note: this evidence comes from [population] and may not fully apply to South Asians."
4. **Citation discipline**: Reference the numbered sources as [1], [2], etc. Every factual claim must cite at least one source. If you cannot cite it, don't say it.
5. **Structured responses**: Structure your answer as follows:
   - **Direct answer** (1-2 sentences addressing the question)
   - **Evidence summary** (what the research shows, with citations)
   - **South Asian-specific considerations** (differences from general population, if any)
   - **Clinical note** (brief reminder about professional medical advice)
6. **Honest uncertainty**: If the context does not contain sufficient evidence, say so clearly. Never fabricate numbers, study names, or conclusions.

Always lead with findings from the highest-evidence source available (guidelines > meta-analyses > primary studies)."""

USER_CONTEXT_ADDENDUM = """

PATIENT CONTEXT (from in-app risk screener — use to personalize relevance, but treat as educational only):
{user_context}
"""

CONTEXT_TEMPLATE = """RESEARCH CONTEXT (each source is labeled with its evidence level — cite these by number when making claims):

{context}

---
USER QUESTION: {question}

Please answer based on the research context above, citing sources by number [1], [2], etc. Prioritize findings from Clinical Guidelines and Meta-Analyses over primary studies when available."""

LOW_CONFIDENCE_NOTE = """

IMPORTANT RETRIEVAL NOTE: The research context above was retrieved with LOW confidence — the top-ranked passages are not strongly relevant to the user's question. You should:
- Explicitly acknowledge that the available research does not directly address the question
- Share only what can be supported by the context, clearly framed as tangentially related
- Strongly recommend the user consult a healthcare provider
- Do NOT extrapolate or fill gaps with general medical knowledge
"""


def build_messages(
    context: str,
    question: str,
    conversation_history: list[dict] | None = None,
    low_confidence: bool = False,
    user_context: Optional[str] = None,
) -> list[dict]:
    system = SYSTEM_PROMPT
    if user_context and user_context.strip():
        system = system + USER_CONTEXT_ADDENDUM.format(user_context=user_context.strip()[:600])
    if low_confidence:
        system = system + LOW_CONFIDENCE_NOTE

    messages = [{"role": "system", "content": system}]
    if conversation_history:
        messages.extend(conversation_history[-6:])
    messages.append({
        "role": "user",
        "content": CONTEXT_TEMPLATE.format(context=context, question=question),
    })
    return messages


def generate_answer(
    context: str,
    question: str,
    groq_client: Groq,
    model: str = GROQ_MODEL,
    conversation_history: list[dict] | None = None,
    low_confidence: bool = False,
    user_context: Optional[str] = None,
) -> str:
    messages = build_messages(
        context, question, conversation_history,
        low_confidence=low_confidence, user_context=user_context
    )
    response = groq_client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.2,
        max_tokens=1500,
    )
    return response.choices[0].message.content


async def stream_answer(
    context: str,
    question: str,
    async_groq_client: AsyncGroq,
    model: str = GROQ_MODEL,
    conversation_history: list[dict] | None = None,
    low_confidence: bool = False,
    user_context: Optional[str] = None,
) -> AsyncIterator[str]:
    messages = build_messages(
        context, question, conversation_history,
        low_confidence=low_confidence, user_context=user_context
    )
    stream = await async_groq_client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.2,
        max_tokens=1500,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
