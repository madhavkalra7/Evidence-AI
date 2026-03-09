# ============================================================
# LLM-AS-A-JUDGE — AI-Powered RAG Quality Evaluation
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  USES A SECOND LLM CALL TO EVALUATE THE QUALITY OF      ║
# ║  THE RAG PIPELINE'S ANSWER ON EVERY QUERY.              ║
# ╚══════════════════════════════════════════════════════════╝
#
# WHY LLM-AS-A-JUDGE?
# ────────────────────
#   Traditional metrics (word overlap, BLEU, ROUGE) are crude.
#   They can't understand MEANING — only token overlap.
#
#   LLM-as-a-judge uses a SECOND LLM call to evaluate the
#   FIRST LLM's answer. It can assess:
#     - Is the answer faithful to the provided context?
#     - Does it actually answer the user's question?
#     - Is it complete or does it miss important details?
#     - Did it hallucinate (make up) information?
#
#   This approach is used by:
#     - RAGAS (Retrieval Augmented Generation Assessment)
#     - MT-Bench (Multi-Turn Benchmark)
#     - AlpacaEval
#     - Chatbot Arena
#
# METRICS WE EVALUATE:
# ─────────────────────
#   ┌──────────────────┬────────────────────────────────────────┐
#   │ Metric           │ What it measures                       │
#   ├──────────────────┼────────────────────────────────────────┤
#   │ Faithfulness     │ Is each claim supported by context?    │
#   │ Correctness      │ Does the answer address the question?  │
#   │ Completeness     │ Are all relevant details included?     │
#   │ Hallucination    │ Did the LLM fabricate information?     │
#   └──────────────────┴────────────────────────────────────────┘
#
#   Each metric is scored 1-5 with a short justification.
#
# HOW IT WORKS:
# ──────────────
#   1. Take the question, retrieved context, and LLM answer
#   2. Send to Groq LLM with a structured judge prompt
#   3. LLM evaluates each metric (1-5 score + reason)
#   4. Parse JSON response → return structured evaluation
#   5. Log alongside existing metrics in evaluation_logs.json
#
# COST:
# ──────
#   One extra Groq API call per /api/chat query (~0.3-0.5s).
#   Since Groq is free-tier for Llama 3, this costs $0.
# ============================================================

import json
import time
from typing import Dict, List, Optional
from groq import Groq
from config import GROQ_API_KEY, GROQ_MODEL

# ── Groq client for judge evaluation ──
_judge_client = Groq(api_key=GROQ_API_KEY)


# ============================================================
# JUDGE PROMPT — Structured evaluation instruction
# ============================================================

JUDGE_SYSTEM_PROMPT = """You are a strict RAG evaluation judge. Your job is to evaluate the quality of an AI assistant's answer given the user's question and the retrieved context chunks used to generate the answer.

You must evaluate on these 4 metrics (score each 1-5):

1. **Faithfulness** (1-5): Is every claim in the answer supported by the provided context?
   - 5 = Every single statement is directly traceable to context
   - 3 = Most claims are supported but some are inferred/generalized
   - 1 = Answer contains many unsupported claims

2. **Correctness** (1-5): Does the answer accurately and directly address the user's question?
   - 5 = Perfectly answers the question with accurate information
   - 3 = Partially answers the question or has minor inaccuracies
   - 1 = Does not answer the question or gives wrong information

3. **Completeness** (1-5): Does the answer cover all important details from the context that are relevant to the question?
   - 5 = All relevant details from context are included
   - 3 = Covers main points but misses some relevant details
   - 1 = Severely incomplete, misses critical information

4. **Hallucination** (1-5): How much fabricated information (not in context) is present? (5 = NO hallucination, 1 = heavy hallucination)
   - 5 = Zero fabrication — everything is from context
   - 3 = Minor additions that could be inferred but aren't explicit in context
   - 1 = Major fabricated facts, names, numbers, or events

RESPOND IN STRICT JSON FORMAT ONLY. No extra text before or after the JSON.

{
  "faithfulness": {"score": <1-5>, "reason": "<short explanation>"},
  "correctness": {"score": <1-5>, "reason": "<short explanation>"},
  "completeness": {"score": <1-5>, "reason": "<short explanation>"},
  "hallucination": {"score": <1-5>, "reason": "<short explanation>"},
  "overall_quality": "<excellent|good|fair|poor>",
  "summary": "<1-2 sentence overall assessment>"
}"""


def evaluate_with_llm_judge(
    question: str,
    answer: str,
    retrieved_chunks: List[Dict],
    case_id: str = "default"
) -> Optional[Dict]:
    """
    Use LLM-as-a-judge to evaluate the quality of a RAG answer.

    This sends the question, context, and answer to a SECOND LLM call.
    The LLM acts as an impartial judge, scoring faithfulness,
    correctness, completeness, and hallucination detection.

    Args:
        question:         The user's original question.
        answer:           The RAG pipeline's generated answer.
        retrieved_chunks: The context chunks that were used.
        case_id:          The active case ID for logging.

    Returns:
        Dictionary with evaluation scores, or None on failure:
        {
          "faithfulness": {"score": 4, "reason": "..."},
          "correctness": {"score": 5, "reason": "..."},
          "completeness": {"score": 3, "reason": "..."},
          "hallucination": {"score": 5, "reason": "..."},
          "overall_quality": "good",
          "summary": "...",
          "judge_model": "llama-3.3-70b-versatile",
          "judge_latency_ms": 450
        }
    """
    if not answer or not question:
        return None

    # Build context string from retrieved chunks
    context_text = ""
    for i, chunk in enumerate(retrieved_chunks):
        source_label = chunk.get("type", "unknown")
        if chunk.get("page", 0) > 0:
            source_label += f", Page {chunk['page']}"
        context_text += f"\n[Chunk {i+1} — {source_label}]\n{chunk.get('text', '')[:500]}\n"

    if not context_text.strip():
        context_text = "(No context chunks were provided)"

    user_prompt = f"""Evaluate this RAG interaction:

═══ USER QUESTION ═══
{question}

═══ RETRIEVED CONTEXT (used to generate the answer) ═══
{context_text}

═══ AI ASSISTANT'S ANSWER ═══
{answer[:2000]}

Now evaluate the answer on faithfulness, correctness, completeness, and hallucination. Return ONLY valid JSON."""

    start_time = time.time()

    try:
        last_err = None
        for attempt in range(2):
            try:
                response = _judge_client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt}
                    ],
                    model=GROQ_MODEL,
                    temperature=0.0,  # Deterministic evaluation
                    max_tokens=500,
                )
                break
            except Exception as e:
                last_err = e
                if attempt < 1:
                    time.sleep(1)
        else:
            print(f"[LLM JUDGE] All attempts failed: {last_err}")
            return None

        latency_ms = int((time.time() - start_time) * 1000)
        raw_content = response.choices[0].message.content.strip()

        # Parse JSON from LLM response (handle markdown code blocks)
        json_str = raw_content
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0].strip()
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0].strip()

        evaluation = json.loads(json_str)

        # Add metadata
        evaluation["judge_model"] = GROQ_MODEL
        evaluation["judge_latency_ms"] = latency_ms
        evaluation["case_id"] = case_id

        # Validate expected keys exist
        for key in ["faithfulness", "correctness", "completeness", "hallucination"]:
            if key not in evaluation:
                evaluation[key] = {"score": 0, "reason": "Evaluation not available"}

        # Print evaluation to console
        print(f"\n[LLM JUDGE] ═══════════════════════════════════════")
        print(f"  Faithfulness  : {evaluation['faithfulness'].get('score', '?')}/5 — {evaluation['faithfulness'].get('reason', '')[:80]}")
        print(f"  Correctness   : {evaluation['correctness'].get('score', '?')}/5 — {evaluation['correctness'].get('reason', '')[:80]}")
        print(f"  Completeness  : {evaluation['completeness'].get('score', '?')}/5 — {evaluation['completeness'].get('reason', '')[:80]}")
        print(f"  Hallucination : {evaluation['hallucination'].get('score', '?')}/5 — {evaluation['hallucination'].get('reason', '')[:80]}")
        print(f"  Overall       : {evaluation.get('overall_quality', '?')}")
        print(f"  Latency       : {latency_ms}ms")
        print(f"[LLM JUDGE] ═══════════════════════════════════════\n")

        return evaluation

    except json.JSONDecodeError as e:
        print(f"[LLM JUDGE] Failed to parse JSON response: {e}")
        print(f"[LLM JUDGE] Raw response: {raw_content[:300]}")
        return None
    except Exception as e:
        print(f"[LLM JUDGE] Evaluation failed: {e}")
        return None
