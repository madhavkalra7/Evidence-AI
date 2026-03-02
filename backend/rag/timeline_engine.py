# ============================================================
# TIMELINE ENGINE — Chronological Event Reconstruction
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  EXTRACTS TIME MENTIONS FROM FORENSIC EVIDENCE AND      ║
# ║  RECONSTRUCTS A CHRONOLOGICAL TIMELINE OF EVENTS.       ║
# ╚══════════════════════════════════════════════════════════╝
#
# WHY TIMELINE RECONSTRUCTION?
# ─────────────────────────────
#   Forensic reports contain scattered time references:
#     "At approximately 10:30 PM, a loud crash was heard..."
#     "The complainant returned home at 11:15 PM..."
#     "Officers arrived at the scene at 11:45 PM..."
#
#   These are buried across multiple PDF pages and image
#   descriptions. Investigators need a CHRONOLOGICAL VIEW
#   to understand the sequence of events, identify gaps,
#   and detect contradictions in the timeline.
#
# HOW IT WORKS:
# ─────────────
#   1. Retrieve ALL chunks from the active case's ChromaDB collection
#   2. Use regex patterns to extract raw time mentions
#   3. Send chunks + extracted times to Groq LLM for:
#      a) Enriching each time mention with event descriptions
#      b) Resolving ambiguous times ("that evening" → estimated time)
#      c) Identifying timeline gaps or contradictions
#   4. Sort events chronologically
#   5. Return structured timeline as JSON
#
# OUTPUT FORMAT:
# ──────────────
#   {
#     "timeline": [
#       {
#         "time": "10:30 PM",
#         "event": "Loud crash heard by neighbor",
#         "source": "PDF Page 1",
#         "confidence": "high"
#       },
#       {
#         "time": "11:15 PM",
#         "event": "Complainant returned home, discovered break-in",
#         "source": "PDF Page 2",
#         "confidence": "high"
#       }
#     ],
#     "gaps": ["No events recorded between 10:30 PM and 11:15 PM"],
#     "contradictions": []
#   }
#
# REGEX PATTERNS FOR TIME EXTRACTION:
# ────────────────────────────────────
#   We use multiple regex patterns to catch various time formats:
#     - 12-hour: "10:30 PM", "2:15 am", "2:15AM"
#     - 24-hour: "22:30", "14:15", "0830 hours"
#     - Written: "ten thirty", "midnight", "noon"
#     - Relative: "approximately 10 PM", "around midnight"
#     - Date+time: "24 Feb 2026 at 22:30", "on the morning of"
#     - Durations: "between 10 PM and 11 PM"
#
#   After regex extraction, the LLM contextualizes each mention
#   with the surrounding text to produce descriptive events.
# ============================================================

import re
import json
from typing import List, Dict, Optional
from groq import Groq
from config import GROQ_API_KEY, GROQ_MODEL
import time as time_module

# ── Groq client for LLM-based timeline enrichment ──
_timeline_client = Groq(api_key=GROQ_API_KEY)


# ============================================================
# TIME EXTRACTION REGEX PATTERNS
# ============================================================
# These patterns capture the most common time formats found
# in forensic reports. Ordered from most specific to least
# specific to avoid false positives.
#
# WHY REGEX + LLM (HYBRID APPROACH)?
# ───────────────────────────────────
#   Pure regex: Fast but misses context ("10:30 PM" → what happened?)
#   Pure LLM: Accurate but expensive and hallucination-prone
#   Hybrid: Regex finds the WHERE, LLM explains the WHAT
# ============================================================

TIME_PATTERNS = [
    # 12-hour format: "10:30 PM", "2:15 am", "10:30PM"
    r'\b(\d{1,2}:\d{2}\s*[AaPp][Mm])\b',

    # 24-hour format: "22:30", "14:15"
    r'\b([01]?\d|2[0-3]):[0-5]\d\b',

    # Military/police format: "0830 hours", "2230 hrs"
    r'\b(\d{4})\s*(?:hours?|hrs?)\b',

    # Written times: "midnight", "noon", "dawn", "dusk"
    r'\b(midnight|noon|midday|dawn|dusk|daybreak|sunrise|sunset)\b',

    # Approximate times: "approximately 10 PM", "around 11:30 PM"
    r'(?:approximately|approx\.?|around|about|roughly|nearly)\s+(\d{1,2}(?::\d{2})?\s*(?:[AaPp][Mm])?)',

    # "at X o'clock"
    r"\b(?:at\s+)?(\d{1,2})\s*o['\u2019]?clock\b",

    # Date with time: "24 Feb 2026 at 22:30"
    r'\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}',

    # Time ranges: "between 10 PM and 11 PM"
    r'between\s+(\d{1,2}(?::\d{2})?\s*(?:[AaPp][Mm])?)\s+and\s+(\d{1,2}(?::\d{2})?\s*(?:[AaPp][Mm])?)',

    # "in the morning/afternoon/evening/night"
    r'\b(?:in the\s+)?(early\s+)?(?:morning|afternoon|evening|night)\b',
]


def extract_time_mentions(text: str, source: str = "unknown", page: int = 0) -> List[Dict]:
    """
    Extract time-related mentions from text using regex patterns.

    Captures time references along with surrounding context
    (±100 characters) for LLM enrichment later.

    Args:
        text:   The text to scan for time mentions.
        source: The document source (e.g., "pdf", "scene_image").
        page:   The page number (0 if N/A).

    Returns:
        List of dictionaries:
        [
            {
                "raw_time": "10:30 PM",
                "context": "...At approximately 10:30 PM, a loud crash...",
                "source": "pdf",
                "page": 1,
                "position": 245
            }
        ]

    WHY ±100 CHARS CONTEXT?
    ────────────────────────
    The raw time ("10:30 PM") is meaningless alone.
    The surrounding text tells us WHAT happened at that time.
    We extract a context window that the LLM can use to
    generate a meaningful event description.
    """
    mentions = []
    seen_positions = set()  # Avoid duplicate extractions at same position

    for pattern in TIME_PATTERNS:
        try:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                start = match.start()
                end = match.end()

                # Skip if we already captured a time at this position (±20 chars)
                position_key = start // 20
                if position_key in seen_positions:
                    continue
                seen_positions.add(position_key)

                # Extract surrounding context (±100 chars)
                ctx_start = max(0, start - 100)
                ctx_end = min(len(text), end + 100)
                context = text[ctx_start:ctx_end].strip()

                mentions.append({
                    "raw_time": match.group(0).strip(),
                    "context": context,
                    "source": source,
                    "page": page,
                    "position": start
                })
        except re.error:
            continue  # Skip invalid patterns

    return mentions


# ============================================================
# LLM-BASED TIMELINE ENRICHMENT PROMPT
# ============================================================
# This prompt instructs the LLM to:
#   1. Take regex-extracted time mentions with context
#   2. Create descriptive event entries
#   3. Sort chronologically
#   4. Identify gaps and contradictions
#
# TEMPERATURE: 0.2 (low — we want factual extraction, not creativity)
# ============================================================

TIMELINE_PROMPT = """You are a forensic timeline analyst. Given evidence text from a criminal case, 
reconstruct a chronological timeline of ALL events.

RULES:
1. Extract EVERY time-referenced event from the evidence
2. For each event, provide:
   - "time": The specific time (e.g., "10:30 PM", "approximately 11 PM")
   - "event": A concise description of what happened (1-2 sentences)
   - "source": Which evidence source mentions this (e.g., "PDF Page 1", "Scene Image")
   - "confidence": "high" (explicit time stated), "medium" (approximate/inferred), "low" (vague reference)
3. Sort events in CHRONOLOGICAL ORDER
4. Identify any TIME GAPS where no events are recorded
5. Identify any CONTRADICTIONS between different sources about timing
6. Include dates if mentioned (e.g., "24 Feb 2026, 10:30 PM")

RESPOND IN VALID JSON ONLY. No explanatory text outside the JSON.

OUTPUT FORMAT:
{
    "timeline": [
        {
            "time": "10:30 PM",
            "event": "Loud crash heard by neighbor at 221B West Ridge Apartments",
            "source": "PDF Page 1",
            "confidence": "high"
        }
    ],
    "gaps": ["No recorded events between 10:30 PM and 11:15 PM — 45 minute gap"],
    "contradictions": [],
    "date_context": "24 February 2026"
}"""


def reconstruct_timeline(chunks: List[Dict], case_id: str = "unknown") -> Dict:
    """
    Reconstruct a chronological timeline from case evidence chunks.

    This is the main entry point for the timeline feature.
    It combines regex extraction with LLM enrichment.

    FLOW:
    ─────
    1. Scan ALL chunks for time mentions (regex)
    2. Combine chunk texts into a single evidence block
    3. Send to Groq LLM with structured timeline prompt
    4. Parse LLM's JSON response
    5. Return enriched timeline

    Args:
        chunks: All text chunks from the active case's ChromaDB collection.
                Each chunk has: text, type, page, source fields.
        case_id: The active case identifier (for logging).

    Returns:
        Dictionary with:
          - "timeline": List of chronological events
          - "gaps": List of identified time gaps
          - "contradictions": List of timing contradictions
          - "date_context": The date(s) of the incident
          - "total_events": Count of timeline entries
          - "raw_time_mentions": Count of regex-detected time references
          - "case_id": The case this timeline belongs to

    ERROR HANDLING:
    ───────────────
    If the LLM fails to produce valid JSON, we fall back to
    regex-only extraction (less descriptive but still useful).
    """
    print(f"\n[TIMELINE] Reconstructing timeline for case: {case_id}")
    print(f"[TIMELINE] Processing {len(chunks)} evidence chunks")

    # ── Step 1: Regex extraction for time mentions ──
    all_mentions = []
    for chunk in chunks:
        mentions = extract_time_mentions(
            text=chunk.get("text", ""),
            source=chunk.get("type", "unknown"),
            page=chunk.get("page", 0)
        )
        all_mentions.extend(mentions)

    print(f"[TIMELINE] Regex found {len(all_mentions)} time mentions")

    # ── Step 2: Combine all evidence text ──
    # Build a structured evidence block for the LLM
    evidence_text = ""
    for i, chunk in enumerate(chunks):
        source_label = chunk.get("type", "unknown")
        page = chunk.get("page", 0)
        if page > 0:
            source_label += f" Page {page}"
        evidence_text += f"\n[Evidence {i+1} — {source_label}]\n{chunk['text']}\n"

    # Truncate to prevent token overflow (Groq has token limits)
    # 8000 chars ≈ 2000 tokens, leaving room for prompt + response
    if len(evidence_text) > 8000:
        evidence_text = evidence_text[:8000] + "\n\n[... truncated for length ...]"
        print(f"[TIMELINE] Evidence truncated to 8000 chars")

    # ── Step 3: LLM-based timeline reconstruction ──
    try:
        last_err = None
        for attempt in range(3):
            try:
                response = _timeline_client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": TIMELINE_PROMPT},
                        {"role": "user", "content": f"Reconstruct a timeline from this forensic evidence:\n\n{evidence_text}"}
                    ],
                    model=GROQ_MODEL,
                    temperature=0.2,
                    max_tokens=2048,
                )
                break
            except Exception as conn_err:
                last_err = conn_err
                print(f"[TIMELINE] LLM attempt {attempt + 1}/3 failed: {conn_err}")
                if attempt < 2:
                    time_module.sleep(1)
        else:
            raise last_err  # type: ignore

        raw_response = response.choices[0].message.content.strip()
        print(f"[TIMELINE] LLM response received ({len(raw_response)} chars)")

        # ── Step 4: Parse JSON response ──
        # The LLM might wrap JSON in ```json ... ``` markers
        json_text = raw_response
        if "```json" in json_text:
            json_text = json_text.split("```json")[1].split("```")[0].strip()
        elif "```" in json_text:
            json_text = json_text.split("```")[1].split("```")[0].strip()

        timeline_data = json.loads(json_text)

        # Ensure required fields exist
        timeline_data.setdefault("timeline", [])
        timeline_data.setdefault("gaps", [])
        timeline_data.setdefault("contradictions", [])
        timeline_data.setdefault("date_context", "Not specified")

        result = {
            "timeline": timeline_data["timeline"],
            "gaps": timeline_data["gaps"],
            "contradictions": timeline_data["contradictions"],
            "date_context": timeline_data.get("date_context", "Not specified"),
            "total_events": len(timeline_data["timeline"]),
            "raw_time_mentions": len(all_mentions),
            "case_id": case_id
        }

        print(f"[TIMELINE] Reconstructed {result['total_events']} events, "
              f"{len(result['gaps'])} gaps, "
              f"{len(result['contradictions'])} contradictions")

        return result

    except json.JSONDecodeError as e:
        print(f"[TIMELINE] ⚠️  JSON parse error: {e}")
        print(f"[TIMELINE] Falling back to regex-only timeline")

        # Fallback: regex-only timeline (no LLM enrichment)
        fallback_timeline = []
        for mention in all_mentions:
            fallback_timeline.append({
                "time": mention["raw_time"],
                "event": mention["context"][:150],
                "source": f"{mention['source']} Page {mention['page']}",
                "confidence": "medium"
            })

        return {
            "timeline": fallback_timeline,
            "gaps": [],
            "contradictions": [],
            "date_context": "Not specified",
            "total_events": len(fallback_timeline),
            "raw_time_mentions": len(all_mentions),
            "case_id": case_id,
            "fallback": True
        }

    except Exception as e:
        print(f"[TIMELINE] ❌ Error: {e}")
        return {
            "timeline": [],
            "gaps": [],
            "contradictions": [],
            "date_context": "Not specified",
            "total_events": 0,
            "raw_time_mentions": len(all_mentions),
            "case_id": case_id,
            "error": str(e)
        }
