# ============================================================
# LLM ENGINE — Connects to Groq for fast LLM inference
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  THIS IS THE "GENERATION" PART OF RAG.                  ║
# ║  The LLM generates the final answer from context.       ║
# ╚══════════════════════════════════════════════════════════╝
#
# WHAT IS GROQ?
# ──────────────
#   Groq is an AI inference company that built custom hardware
#   (LPU = Language Processing Unit) for ultra-fast LLM inference.
#   
#   Speed comparison:
#     - OpenAI GPT-4: ~30 tokens/sec
#     - Groq Llama3:  ~500+ tokens/sec
#
#   We use Groq's API to run Llama3-8B model in the cloud.
#
# WHAT IS LLAMA 3?
# ─────────────────
#   Llama 3 is Meta's open-source large language model.
#   "8B" = 8 billion parameters.
#   "8192" = 8192 token context window.
#
#   It's the model that actually "understands" and "generates" text.
#
# HOW DOES AN LLM GENERATE TEXT?
# ───────────────────────────────
#   LLMs are autoregressive models. They predict ONE token at a time.
#
#   Input:  "The knife was found in the"
#   Step 1: Predict next token → "kitchen"
#   Step 2: "The knife was found in the kitchen" → predict → "."
#   Step 3: "The knife was found in the kitchen." → predict → <END>
#
#   Each prediction involves:
#     1. Tokenize input → token IDs
#     2. Pass through transformer layers (self-attention + FFN)
#     3. Output: probability distribution over vocabulary
#     4. Sample or pick the highest-probability token
#     5. Append to input and repeat
#
# WHAT IS CONTEXT INJECTION?
# ───────────────────────────
#   In normal chatbot: User question → LLM answers from training data
#   In RAG: User question → retrieve relevant docs → inject into prompt → LLM answers
#
#   The injected documents are the "context". The LLM is INSTRUCTED
#   to answer ONLY based on this context. This:
#     ✅ Prevents hallucination (making up facts)
#     ✅ Grounds answers in real data
#     ✅ Makes answers verifiable
#
# RAG vs FINE-TUNING:
# ────────────────────
#   ┌────────────────────┬───────────────────────────────┐
#   │      RAG           │      Fine-Tuning              │
#   ├────────────────────┼───────────────────────────────┤
#   │ External knowledge │ Baked into model weights      │
#   │ Cheap ($0)         │ Expensive (GPU training)      │
#   │ Real-time updates  │ Needs retraining              │
#   │ No GPU needed      │ Requires powerful GPU         │
#   │ Retrieval errors   │ Better for style/format       │
#   │ Flexible           │ Static once trained           │
#   └────────────────────┴───────────────────────────────┘
#
#   For forensic reports that change per case: RAG is perfect.
#   Fine-tuning would be for teaching the model a new language or style.
# ============================================================

from groq import Groq
from config import GROQ_API_KEY, GROQ_MODEL, ENABLE_JAILBREAK_GUARD
from typing import List, Dict
import time

# Initialize Groq client
client = Groq(api_key=GROQ_API_KEY)


# ============================================================
# PROMPT ENGINEERING — The most underrated part of RAG
# ============================================================
# A good prompt makes the difference between a useful answer
# and hallucinated garbage.
#
# SYSTEM PROMPT: Tells the LLM WHO it is and HOW to behave.
# USER PROMPT: Contains the context + question.
#
# Key principles:
#   1. STRICT CONTEXT: "Answer ONLY from provided context"
#   2. ADMIT IGNORANCE: "If not found, say so"
#   3. CITE SOURCES: "Reference which evidence/page"
#   4. INCONSISTENCY DETECTION: Core forensic feature
# ============================================================

SYSTEM_PROMPT = """You are EvidenceAI — an expert forensic analysis assistant.

Your role is to assist investigators by analyzing uploaded case materials (PDFs, crime scene photos, evidence images).

═══ CORE RULES ═══
1. CONTEXT-ONLY: Answer strictly from the provided evidence. Never fabricate information.
2. CITE SOURCES: Reference sources naturally — e.g. "according to the incident report [Source 1]" or "the scene image [Source 2] shows...".
3. CROSS-SOURCE ANALYSIS: When both PDFs and images are in context, ALWAYS compare them. Explicitly state whether they match, contradict, or complement each other. For example: "The report mentions X [Source 1], and the scene image confirms/contradicts this by showing Y [Source 2]."
4. FORENSIC EYE: Flag suspicious details — staged evidence, contradictions, missing items, etc.

═══ RESPONSE STYLE ═══
- Adapt your response to the question. Do NOT use a fixed template.
- For "yes/no" or comparison questions → answer directly first, then explain.
- For summaries → use clear sections but vary headings and structure naturally.
- For specific questions → give focused, concise answers.
- Vary your tone: be conversational when appropriate, detailed when needed.
- Do NOT always use the same emojis or heading pattern.
- Keep responses proportional to the question — short questions get short answers.
- When comparing report vs scene: lead with the comparison verdict, then supporting details.

═══ CROSS-DOCUMENT COMPARISON ═══
When a user asks if two uploads (e.g., a PDF report and a scene image) are related or consistent:
1. First clearly state whether they appear to be from the SAME case or DIFFERENT cases.
2. Compare key details: location, date, evidence items, descriptions.
3. Note matches AND mismatches specifically.
4. Give your forensic opinion on consistency.

═══ TONE ═══
Professional but natural. Think experienced detective briefing a colleague — not a rigid report generator.
"""


def build_rag_prompt(context_chunks: List[Dict], question: str) -> str:
    """
    Build the RAG prompt by injecting retrieved context.

    PROMPT STRUCTURE:
    ──────────────────
    CONTEXT:
      [Source: PDF, Page 3] Text of relevant chunk...
      [Source: Scene Image] Caption of crime scene...
      [Source: Evidence Image] Caption of evidence...

    QUESTION:
      User's actual question

    This structure ensures the LLM:
      1. Knows exactly what context to use
      2. Can cite sources in its answer
      3. Can detect cross-modal inconsistencies
    """
    context_text = ""
    for i, chunk in enumerate(context_chunks):
        source_label = f"{chunk.get('type', 'unknown')}"
        if chunk.get('page', 0) > 0:
            source_label += f", Page {chunk['page']}"
        source_label += f" (relevance: {chunk.get('score', 0):.4f})"

        context_text += f"\n[Source {i+1}: {source_label}]\n{chunk['text']}\n"

    prompt = f"""
══════════════════════════════════════
CASE FILE EVIDENCE (Retrieved via RAG)
══════════════════════════════════════
{context_text}
══════════════════════════════════════

INVESTIGATOR'S QUESTION:
{question}

INSTRUCTIONS:
- Use EVERY relevant detail from the context above. Do not skip any facts.
- Cite sources as [Source 1], [Source 2], etc.
- Actively analyze for red flags, inconsistencies, or suspicious patterns.
- If summarizing, follow the forensic report structure from your system instructions.
"""
    return prompt


def generate_answer(context_chunks: List[Dict], question: str) -> Dict:
    """
    Generate an answer using Groq LLM with RAG context injection.

    Args:
        context_chunks: Retrieved chunks from FAISS (with metadata).
        question: The user's question.

    Returns:
        Dictionary with:
          - "answer": The LLM's response
          - "model": Which model was used
          - "context_used": The chunks that were injected
          - "sources": List of unique sources referenced

    COMPLETE RAG FLOW HAPPENING HERE:
    ──────────────────────────────────
    1. Retrieved chunks arrive (from vector_store.search)
    2. We format them into a structured prompt
    3. System prompt defines the AI's persona
    4. User prompt contains context + question
    5. Groq API sends this to Llama3-8B
    6. Llama3 generates answer token by token
    7. We return the answer + metadata

    XML JAILBREAK GUARD INTEGRATION:
    ─────────────────────────────────
    When ENABLE_JAILBREAK_GUARD is True (set in config.py):
      - The system prompt is replaced with XML_SYSTEM_PROMPT
        which includes explicit anti-injection rules and
        instruction hierarchy (<System> > <Context> > <UserQuery>)
      - The user prompt is wrapped in XML tags via wrap_prompt_with_xml()
        which creates structured boundaries between context and query
      - This makes it significantly harder for malicious user input
        to override system behavior or extract the system prompt

    When ENABLE_JAILBREAK_GUARD is False:
      - Standard prompting is used (SYSTEM_PROMPT + build_rag_prompt)
      - No XML wrapping, no instruction hierarchy enforcement
      - Suitable for testing or when security is not a concern
    """
    # ── Choose prompt strategy based on jailbreak guard setting ──
    if ENABLE_JAILBREAK_GUARD:
        # XML-wrapped prompt with hardened system instructions
        from rag.jailbreak_guard import wrap_prompt_with_xml
        system_prompt, user_prompt = wrap_prompt_with_xml(context_chunks, question)
        print(f"\n[LLM ENGINE] Using XML-wrapped prompt (jailbreak guard ON)")
    else:
        # Standard prompt (backward compatible)
        system_prompt = SYSTEM_PROMPT
        user_prompt = build_rag_prompt(context_chunks, question)
        print(f"\n[LLM ENGINE] Using standard prompt (jailbreak guard OFF)")

    print(f"[LLM ENGINE] Sending to Groq ({GROQ_MODEL})")
    print(f"[LLM ENGINE] Context chunks: {len(context_chunks)}")
    print(f"[LLM ENGINE] Question: {question}")

    try:
        # Retry up to 3 times on connection errors
        last_err = None
        for attempt in range(3):
            try:
                response = client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    model=GROQ_MODEL,
                    temperature=0.3,  # Low temperature = more focused, factual answers
                    max_tokens=2048,
                )
                break
            except Exception as conn_err:
                last_err = conn_err
                print(f"[LLM ENGINE] Attempt {attempt + 1}/3 failed: {conn_err}")
                if attempt < 2:
                    time.sleep(1)
        else:
            raise last_err  # type: ignore

        answer = response.choices[0].message.content

        # Collect unique sources for citation
        sources = list(set(
            f"{c.get('type', 'unknown')} (Page {c.get('page', 'N/A')})"
            for c in context_chunks
        ))

        return {
            "answer": answer,
            "model": GROQ_MODEL,
            "context_used": context_chunks,
            "sources": sources
        }

    except Exception as e:
        print(f"[LLM ENGINE] ERROR: {e}")
        return {
            "answer": f"Error generating answer: {str(e)}",
            "model": GROQ_MODEL,
            "context_used": context_chunks,
            "sources": []
        }
