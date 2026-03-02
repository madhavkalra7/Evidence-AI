# ============================================================
# HYPOTHESIS ENGINE — AI-Powered Forensic Hypothesis Generator
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  GENERATES MULTIPLE INVESTIGATIVE HYPOTHESES FROM       ║
# ║  CASE EVIDENCE AND RATES EACH BY EVIDENCE STRENGTH.     ║
# ╚══════════════════════════════════════════════════════════╝
#
# WHY AI HYPOTHESIS GENERATION?
# ──────────────────────────────
#   Human investigators can fall prey to CONFIRMATION BIAS:
#   once they form an initial theory, they tend to look for
#   evidence that supports it while ignoring contradictions.
#
#   AI hypothesis generation combats this by:
#     1. Generating MULTIPLE competing hypotheses objectively
#     2. Rating each by the STRENGTH of supporting evidence
#     3. Identifying what ADDITIONAL evidence would be needed
#     4. Highlighting evidence that CONTRADICTS each hypothesis
#
#   This is inspired by the "Analysis of Competing Hypotheses"
#   (ACH) methodology used by intelligence agencies.
#
# HOW IT WORKS:
# ─────────────
#   1. Retrieve ALL chunks from the active case's ChromaDB collection
#   2. Send evidence to Groq LLM with a structured hypothesis prompt
#   3. LLM generates 3-5 hypotheses with:
#      - Hypothesis description
#      - Evidence strength rating (strong / moderate / weak)
#      - Supporting evidence references
#      - Contradicting evidence
#      - Missing evidence (what's needed to confirm/deny)
#   4. Return structured JSON for investigator review
#
# OUTPUT FORMAT:
# ──────────────
#   {
#     "hypotheses": [
#       {
#         "id": 1,
#         "title": "Forced Entry Burglary",
#         "description": "Unknown perpetrator(s) broke in through...",
#         "evidence_strength": "strong",
#         "confidence_score": 0.85,
#         "supporting_evidence": ["Broken window latch [Page 1]", ...],
#         "contradicting_evidence": ["Glass found inside [Page 2]"],
#         "missing_evidence": ["Fingerprint analysis pending"]
#       },
#       {
#         "id": 2,
#         "title": "Staged Crime Scene / Insurance Fraud",
#         "description": "The break-in was staged to appear as...",
#         "evidence_strength": "moderate",
#         "confidence_score": 0.45,
#         "supporting_evidence": ["Glass inside despite 'outside' break-in"],
#         "contradicting_evidence": [...],
#         "missing_evidence": ["Financial records of complainant"]
#       }
#     ],
#     "primary_hypothesis": "Forced Entry Burglary",
#     "analysis_notes": "The physical evidence strongly supports..."
#   }
#
# EVIDENCE STRENGTH RATING SYSTEM:
# ─────────────────────────────────
#   ┌──────────┬────────────┬──────────────────────────────────┐
#   │ Rating   │ Score      │ Meaning                          │
#   ├──────────┼────────────┼──────────────────────────────────┤
#   │ strong   │ 0.70-1.00  │ Multiple evidence items support  │
#   │ moderate │ 0.40-0.69  │ Some evidence, plausible theory  │
#   │ weak     │ 0.10-0.39  │ Possible but largely unsupported │
#   │ specul.  │ 0.00-0.09  │ No direct evidence, theoretical  │
#   └──────────┴────────────┴──────────────────────────────────┘
#
# ACH (ANALYSIS OF COMPETING HYPOTHESES):
# ────────────────────────────────────────
#   ACH is a structured methodology developed by Richards Heuer
#   for the CIA. The core idea:
#     1. List ALL possible hypotheses (not just the "obvious" one)
#     2. For each piece of evidence, mark which hypotheses it
#        supports vs. contradicts
#     3. The "winning" hypothesis is NOT the one with the most
#        support, but the one with the LEAST contradicting evidence
#
#   Our AI approximates this by explicitly asking the LLM to
#   identify CONTRADICTING evidence for each hypothesis.
# ============================================================

import json
from typing import List, Dict
from groq import Groq
from config import GROQ_API_KEY, GROQ_MODEL
import time

# ── Groq client for hypothesis generation ──
_hypothesis_client = Groq(api_key=GROQ_API_KEY)


# ============================================================
# HYPOTHESIS GENERATION PROMPT
# ============================================================
# This prompt uses the ACH methodology to generate competing
# investigative hypotheses from forensic evidence.
#
# KEY DESIGN DECISIONS:
#   1. Request 3-5 hypotheses (not too few, not overwhelming)
#   2. Require BOTH supporting AND contradicting evidence
#   3. Require a confidence score (quantifiable metric)
#   4. Ask for missing evidence (investigative next steps)
#   5. Temperature 0.4 (slightly creative — we WANT diverse theories)
# ============================================================

HYPOTHESIS_PROMPT = """You are a senior forensic investigator performing an Analysis of Competing Hypotheses (ACH).

Given the forensic evidence below, generate 3-5 COMPETING HYPOTHESES about what happened.

For EACH hypothesis, provide:
1. "id": Sequential number (1, 2, 3...)
2. "title": Short hypothesis name (e.g., "Forced Entry Burglary", "Staged Crime Scene")
3. "description": 2-3 sentence explanation of the theory
4. "evidence_strength": Rating — one of "strong", "moderate", "weak", or "speculative"
5. "confidence_score": Float between 0.0 and 1.0 (how well evidence supports this hypothesis)
6. "supporting_evidence": List of specific evidence items that SUPPORT this hypothesis (cite sources)
7. "contradicting_evidence": List of evidence items that CONTRADICT this hypothesis
8. "missing_evidence": List of evidence/tests that WOULD confirm or deny this hypothesis

ALSO provide:
- "primary_hypothesis": The title of the MOST LIKELY hypothesis based on current evidence
- "analysis_notes": A brief paragraph explaining your reasoning for the ranking

RULES:
- Be OBJECTIVE — do not favor the obvious hypothesis
- Every hypothesis must have at least 1 supporting evidence item
- ALWAYS look for contradicting evidence — if none found, explain why
- Include at least one "alternative" or "unconventional" hypothesis
- Cite evidence sources as [Source N] or [PDF Page N]
- Confidence scores across all hypotheses should NOT all be identical

RESPOND IN VALID JSON ONLY. No explanatory text outside the JSON.

OUTPUT FORMAT:
{
    "hypotheses": [
        {
            "id": 1,
            "title": "Hypothesis Title",
            "description": "Explanation of the theory...",
            "evidence_strength": "strong",
            "confidence_score": 0.85,
            "supporting_evidence": ["Evidence item 1 [Source]", "Evidence item 2 [Source]"],
            "contradicting_evidence": ["Evidence item that weakens this theory"],
            "missing_evidence": ["What investigation steps would confirm this"]
        }
    ],
    "primary_hypothesis": "Most likely hypothesis title",
    "analysis_notes": "Reasoning for hypothesis ranking..."
}"""


def generate_hypotheses(chunks: List[Dict], case_id: str = "unknown") -> Dict:
    """
    Generate competing forensic hypotheses from case evidence.

    This is the main entry point for the hypothesis feature.
    Uses Groq LLM with ACH-inspired prompting.

    FLOW:
    ─────
    1. Combine all evidence chunks into structured text
    2. Send to Groq LLM with ACH hypothesis prompt
    3. Parse JSON response
    4. Validate and return structured hypotheses

    Args:
        chunks: All text chunks from the active case's ChromaDB collection.
                Each chunk has: text, type, page, source fields.
        case_id: The active case identifier (for logging).

    Returns:
        Dictionary with:
          - "hypotheses": List of hypothesis objects with ratings
          - "primary_hypothesis": The top-rated theory
          - "analysis_notes": Overall reasoning
          - "total_hypotheses": Count generated
          - "case_id": The case analyzed

    ERROR HANDLING:
    ───────────────
    If the LLM fails to produce valid JSON, we return a single
    generic hypothesis acknowledging the evidence without analysis.
    """
    print(f"\n[HYPOTHESIS] Generating hypotheses for case: {case_id}")
    print(f"[HYPOTHESIS] Analyzing {len(chunks)} evidence chunks")

    # ── Build evidence text ──
    evidence_text = ""
    for i, chunk in enumerate(chunks):
        source_label = chunk.get("type", "unknown")
        page = chunk.get("page", 0)
        if page > 0:
            source_label += f" Page {page}"
        evidence_text += f"\n[Evidence {i+1} — {source_label}]\n{chunk['text']}\n"

    # Truncate to prevent token overflow
    if len(evidence_text) > 8000:
        evidence_text = evidence_text[:8000] + "\n\n[... additional evidence truncated ...]"
        print(f"[HYPOTHESIS] Evidence truncated to 8000 chars")

    if not evidence_text.strip():
        return {
            "hypotheses": [],
            "primary_hypothesis": "No evidence available",
            "analysis_notes": "No evidence chunks found in the active case.",
            "total_hypotheses": 0,
            "case_id": case_id
        }

    # ── LLM-based hypothesis generation ──
    try:
        last_err = None
        for attempt in range(3):
            try:
                response = _hypothesis_client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": HYPOTHESIS_PROMPT},
                        {"role": "user", "content": f"Generate competing hypotheses from this forensic evidence:\n\n{evidence_text}"}
                    ],
                    model=GROQ_MODEL,
                    temperature=0.4,  # Slightly creative for diverse hypotheses
                    max_tokens=2048,
                )
                break
            except Exception as conn_err:
                last_err = conn_err
                print(f"[HYPOTHESIS] LLM attempt {attempt + 1}/3 failed: {conn_err}")
                if attempt < 2:
                    time.sleep(1)
        else:
            raise last_err  # type: ignore

        raw_response = response.choices[0].message.content.strip()
        print(f"[HYPOTHESIS] LLM response received ({len(raw_response)} chars)")

        # ── Parse JSON response ──
        json_text = raw_response
        if "```json" in json_text:
            json_text = json_text.split("```json")[1].split("```")[0].strip()
        elif "```" in json_text:
            json_text = json_text.split("```")[1].split("```")[0].strip()

        hypothesis_data = json.loads(json_text)

        # Validate and normalize
        hypotheses = hypothesis_data.get("hypotheses", [])
        for h in hypotheses:
            h.setdefault("id", 0)
            h.setdefault("title", "Untitled Hypothesis")
            h.setdefault("description", "")
            h.setdefault("evidence_strength", "moderate")
            h.setdefault("confidence_score", 0.5)
            h.setdefault("supporting_evidence", [])
            h.setdefault("contradicting_evidence", [])
            h.setdefault("missing_evidence", [])

            # Clamp confidence score to [0, 1]
            h["confidence_score"] = max(0.0, min(1.0, float(h["confidence_score"])))

        # Sort by confidence score (highest first)
        hypotheses.sort(key=lambda x: x["confidence_score"], reverse=True)

        result = {
            "hypotheses": hypotheses,
            "primary_hypothesis": hypothesis_data.get("primary_hypothesis", 
                                    hypotheses[0]["title"] if hypotheses else "Unknown"),
            "analysis_notes": hypothesis_data.get("analysis_notes", ""),
            "total_hypotheses": len(hypotheses),
            "case_id": case_id
        }

        print(f"[HYPOTHESIS] Generated {result['total_hypotheses']} hypotheses")
        for h in hypotheses:
            print(f"  [{h['evidence_strength'].upper()}] {h['title']} "
                  f"(confidence: {h['confidence_score']:.2f})")

        return result

    except json.JSONDecodeError as e:
        print(f"[HYPOTHESIS] ⚠️  JSON parse error: {e}")

        # Fallback: return raw LLM text as a single hypothesis note
        return {
            "hypotheses": [{
                "id": 1,
                "title": "Analysis In Progress",
                "description": "The AI analyzed the evidence but the structured output could not be parsed. "
                               "Please review the raw analysis below.",
                "evidence_strength": "moderate",
                "confidence_score": 0.5,
                "supporting_evidence": [f"Based on {len(chunks)} evidence chunks"],
                "contradicting_evidence": [],
                "missing_evidence": ["Structured re-analysis recommended"],
                "raw_analysis": raw_response[:2000] if 'raw_response' in dir() else ""
            }],
            "primary_hypothesis": "Analysis In Progress",
            "analysis_notes": "JSON parsing failed — raw analysis returned",
            "total_hypotheses": 1,
            "case_id": case_id,
            "fallback": True
        }

    except Exception as e:
        print(f"[HYPOTHESIS] ❌ Error: {e}")
        return {
            "hypotheses": [],
            "primary_hypothesis": "Error",
            "analysis_notes": f"Hypothesis generation failed: {str(e)}",
            "total_hypotheses": 0,
            "case_id": case_id,
            "error": str(e)
        }
