"""
Groq LLM RAG chain with South Asian health system prompt and citation output.
Uses llama-3.3-70b-versatile via Groq's free API tier.
Supports streaming response generation.
"""
from __future__ import annotations

from typing import AsyncIterator

from groq import AsyncGroq, Groq

GROQ_MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """You are a specialized South Asian health assistant grounded strictly in peer-reviewed scientific research and clinical guidelines. Your role is to answer questions about health topics that are particularly relevant to South Asian populations (people with ancestry from India, Pakistan, Bangladesh, Sri Lanka, Nepal, Bhutan, Maldives, and neighboring regions).

Key principles:
1. **Evidence-based only**: Base all answers on the provided research context. Do not speculate beyond what the evidence supports.
2. **Evidence hierarchy**: Each source is tagged with its evidence level — (Clinical Guideline) and (Meta-Analysis / Systematic Review) are strongest and should be cited first when available. Primary studies are weaker; single studies should be framed as "one study found" rather than as established fact.
3. **South Asian specificity**: Highlight where South Asian populations differ from general population guidelines — for example, lower BMI thresholds for obesity risk (≥23 kg/m² = overweight, ≥27.5 kg/m² = obese per WHO Asia-Pacific guidelines), higher cardiometabolic risk at lower body weights, earlier onset of type 2 diabetes, different waist circumference cutoffs, etc.
4. **Citation discipline**: Reference the numbered sources as [1], [2], etc. Every factual claim must cite at least one source. If you cannot cite it, don't say it.
5. **Clinical caution**: Always remind users that your responses are for educational purposes and not a substitute for professional medical advice.
6. **Honest uncertainty**: If the context does not contain sufficient evidence, say so clearly. Never fabricate numbers, study names, or conclusions.

When answering:
- Lead with findings from the highest-evidence source available (guidelines > meta-analyses > primary studies)
- Use plain language accessible to a general audience
- Include specific numerical data when available (e.g., risk ratios, prevalence rates, cutoffs)
- End with a brief recommendation to consult a healthcare provider for personal medical decisions"""

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
) -> list[dict]:
    system = SYSTEM_PROMPT
    if low_confidence:
        system = SYSTEM_PROMPT + LOW_CONFIDENCE_NOTE

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
) -> str:
    messages = build_messages(context, question, conversation_history, low_confidence=low_confidence)
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
) -> AsyncIterator[str]:
    messages = build_messages(context, question, conversation_history, low_confidence=low_confidence)
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
