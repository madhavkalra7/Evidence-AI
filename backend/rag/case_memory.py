# ============================================================
# CASE MEMORY — Cross-Session Memory & Case Comparison
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  STORES CASE SUMMARIES PERSISTENTLY AND ENABLES         ║
# ║  CROSS-CASE COMPARISON ACROSS SESSIONS.                 ║
# ╚══════════════════════════════════════════════════════════╝
#
# WHY CROSS-SESSION MEMORY?
# ──────────────────────────
#   Without memory, each session is isolated. The system forgets
#   everything about previous cases after a reset or switch.
#
#   With memory:
#     - Investigators can ask: "Compare this case with the previous one"
#     - The system can identify similar PATTERNS across cases
#     - Case summaries persist even after vector store resets
#     - Historical case knowledge enables better analysis
#
# HOW IT WORKS:
# ─────────────
#   1. When a case's evidence is analyzed, we store a detailed
#      summary in case_memory.json (separate from case_registry.json)
#   2. Summaries capture: incident type, key evidence, timeline,
#      suspects, forensic findings, and outcome
#   3. For cross-case comparison, we send both case summaries
#      to Groq LLM with a comparative analysis prompt
#   4. The LLM identifies patterns, similarities, differences,
#      and potential connections between cases
#
# DATA ARCHITECTURE:
# ──────────────────
#   case_registry.json: Lightweight case metadata (for auto-linking)
#     - summary_embedding, description, created_at, file_count
#
#   case_memory.json: Rich case summaries (for cross-case analysis)
#     - detailed_summary, incident_type, key_evidence, key_findings
#     - last_updated, query_count, comparison_history
#
#   WHY SEPARATE FILES?
#     case_registry is read on EVERY upload (needs to be fast)
#     case_memory is read only for comparison queries (can be larger)
#     Different access patterns → different storage
#
# CROSS-CASE COMPARISON OUTPUT:
# ──────────────────────────────
#   {
#     "case_a": "CASE-20260224-a1b2c3",
#     "case_b": "CASE-20260224-d4e5f6",
#     "similarities": ["Both involve residential break-ins", ...],
#     "differences": ["Case A used forced entry, Case B was unlocked"],
#     "patterns": ["Same time of night (10-11 PM)", ...],
#     "possible_connections": ["Could be same perpetrator based on MO"],
#     "recommendation": "Cross-reference fingerprint evidence"
#   }
# ============================================================

import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from groq import Groq
from config import GROQ_API_KEY, GROQ_MODEL
import time

# ── Groq client for summary generation and comparison ──
_memory_client = Groq(api_key=GROQ_API_KEY)

# ── Path to persistent case memory store ──
CASE_MEMORY_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "case_memory.json"
)


# ============================================================
# MEMORY STORAGE FUNCTIONS
# ============================================================

def _load_memory() -> Dict:
    """
    Load the case memory store from disk.

    Returns:
        Dictionary mapping case_id → case memory object.
        Empty dict if file doesn't exist or is corrupted.

    FILE FORMAT:
        {
          "CASE-20260224-a1b2c3": {
            "detailed_summary": "Burglary at 221B West Ridge...",
            "incident_type": "residential burglary",
            "key_evidence": ["broken window latch", "footprints", ...],
            "key_findings": ["forced entry from rear", ...],
            "created_at": "2026-02-24T14:30:00",
            "last_updated": "2026-02-24T15:00:00",
            "query_count": 5,
            "comparisons": ["CASE-20260224-d4e5f6"]
          }
        }
    """
    if not os.path.exists(CASE_MEMORY_PATH):
        return {}

    try:
        with open(CASE_MEMORY_PATH, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return json.loads(content) if content else {}
    except (json.JSONDecodeError, IOError) as e:
        print(f"[CASE MEMORY] ⚠️  Memory file corrupted, starting fresh: {e}")
        return {}


def _save_memory(memory: Dict) -> None:
    """
    Save the case memory store to disk.

    Writes the entire memory as a JSON object.
    """
    with open(CASE_MEMORY_PATH, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)
    print(f"[CASE MEMORY] Memory saved ({len(memory)} cases stored)")


# ============================================================
# SUMMARY GENERATION PROMPT
# ============================================================
# This prompt creates a DETAILED case summary suitable for
# cross-case comparison. Different from case_supervisor's
# summary (which is short for embedding-based matching).
#
# This summary is LONGER and more structured — capturing
# all the facts needed for meaningful case comparison.
# ============================================================

MEMORY_SUMMARY_PROMPT = """You are a forensic case analyst. Create a comprehensive case summary 
from the evidence provided. This summary will be stored in a case database for future 
cross-case comparison.

INCLUDE:
1. "detailed_summary": A thorough 200-300 word narrative summary of the entire case
2. "incident_type": Category (e.g., "residential burglary", "arson", "assault", "homicide")
3. "key_evidence": List of all significant evidence items found
4. "key_findings": List of major forensic observations and conclusions
5. "suspects_info": Any information about suspects or persons of interest
6. "location": Where the incident occurred
7. "time_of_incident": When the incident occurred
8. "method_of_operation": How the crime was committed (modus operandi)
9. "damage_or_loss": What was stolen, damaged, or lost

RULES:
- Be factual and specific — cite the evidence directly
- Include ALL relevant details — names, locations, times, items
- Do NOT add speculation — only facts from the evidence
- Write in a format suitable for comparison with other cases

RESPOND IN VALID JSON ONLY.

OUTPUT FORMAT:
{
    "detailed_summary": "Comprehensive case narrative...",
    "incident_type": "residential burglary",
    "key_evidence": ["item 1", "item 2"],
    "key_findings": ["finding 1", "finding 2"],
    "suspects_info": "Description or 'No suspect information available'",
    "location": "Address or location description",
    "time_of_incident": "Date and time",
    "method_of_operation": "How the crime was committed",
    "damage_or_loss": "What was stolen/damaged"
}"""


COMPARISON_PROMPT = """You are a forensic analyst performing a cross-case comparison.
Compare the following two forensic cases and identify patterns, connections, and differences.

PROVIDE:
1. "similarities": List of specific similarities between the two cases
2. "differences": List of key differences between the cases
3. "patterns": Any behavioral, temporal, or methodological patterns that suggest a connection
4. "possible_connections": Whether these cases could be linked (same perpetrator, same network, etc.)
5. "recommendation": What investigative steps should be taken based on this comparison

RULES:
- Be specific — cite evidence from both cases
- Consider: method of entry, time of day, location, items stolen, evidence left behind
- Consider: suspect descriptions, witness accounts, forensic evidence types
- Provide actionable recommendations, not just observations
- If no meaningful connection exists, state that clearly

RESPOND IN VALID JSON ONLY.

OUTPUT FORMAT:
{
    "similarities": ["Both cases involve...", "Similar method of entry..."],
    "differences": ["Case A occurred at night while Case B..."],
    "patterns": ["Same time window (10 PM - midnight)..."],
    "possible_connections": ["Could be same perpetrator based on..."],
    "risk_assessment": "Low/Medium/High likelihood of case connection",
    "recommendation": "Cross-reference fingerprints from both scenes..."
}"""


def store_case_summary(case_id: str, chunks: List[Dict]) -> Dict:
    """
    Generate and store a detailed case summary in persistent memory.

    This is called when the user requests a case summary or
    when evidence analysis is complete. The summary is stored
    for future cross-case comparison.

    FLOW:
    ─────
    1. Combine all evidence chunks into structured text
    2. Send to Groq LLM with comprehensive summary prompt
    3. Parse JSON response
    4. Store in case_memory.json
    5. Return the generated summary

    Args:
        case_id: The case identifier to summarize.
        chunks:  All text chunks from the case's ChromaDB collection.

    Returns:
        Dictionary with the case summary and metadata.
    """
    print(f"\n[CASE MEMORY] Generating summary for case: {case_id}")
    print(f"[CASE MEMORY] Processing {len(chunks)} evidence chunks")

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
        evidence_text = evidence_text[:8000] + "\n\n[... truncated for length ...]"

    # ── LLM-based summary generation ──
    try:
        last_err = None
        for attempt in range(3):
            try:
                response = _memory_client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": MEMORY_SUMMARY_PROMPT},
                        {"role": "user", "content": f"Create a case summary from this evidence:\n\n{evidence_text}"}
                    ],
                    model=GROQ_MODEL,
                    temperature=0.2,
                    max_tokens=2048,
                )
                break
            except Exception as conn_err:
                last_err = conn_err
                print(f"[CASE MEMORY] Summary attempt {attempt + 1}/3 failed: {conn_err}")
                if attempt < 2:
                    time.sleep(1)
        else:
            raise last_err  # type: ignore

        raw_response = response.choices[0].message.content.strip()

        # ── Parse JSON response ──
        json_text = raw_response
        if "```json" in json_text:
            json_text = json_text.split("```json")[1].split("```")[0].strip()
        elif "```" in json_text:
            json_text = json_text.split("```")[1].split("```")[0].strip()

        summary_data = json.loads(json_text)

        # ── Store in memory ──
        memory = _load_memory()

        # Merge with existing memory entry if it exists
        existing = memory.get(case_id, {})
        memory[case_id] = {
            "detailed_summary": summary_data.get("detailed_summary", ""),
            "incident_type": summary_data.get("incident_type", "unknown"),
            "key_evidence": summary_data.get("key_evidence", []),
            "key_findings": summary_data.get("key_findings", []),
            "suspects_info": summary_data.get("suspects_info", "Not available"),
            "location": summary_data.get("location", "Not specified"),
            "time_of_incident": summary_data.get("time_of_incident", "Not specified"),
            "method_of_operation": summary_data.get("method_of_operation", "Not specified"),
            "damage_or_loss": summary_data.get("damage_or_loss", "Not specified"),
            "created_at": existing.get("created_at", datetime.now().isoformat()),
            "last_updated": datetime.now().isoformat(),
            "query_count": existing.get("query_count", 0),
            "comparisons": existing.get("comparisons", [])
        }

        _save_memory(memory)

        print(f"[CASE MEMORY] Summary stored for case: {case_id}")
        print(f"[CASE MEMORY] Incident type: {memory[case_id]['incident_type']}")
        print(f"[CASE MEMORY] Key evidence: {len(memory[case_id]['key_evidence'])} items")

        return {
            "case_id": case_id,
            "summary": memory[case_id],
            "status": "stored"
        }

    except json.JSONDecodeError as e:
        print(f"[CASE MEMORY] ⚠️  JSON parse error: {e}")

        # Fallback: store raw text as summary
        memory = _load_memory()
        memory[case_id] = {
            "detailed_summary": raw_response[:2000] if 'raw_response' in dir() else "Summary generation failed",
            "incident_type": "unknown",
            "key_evidence": [],
            "key_findings": [],
            "suspects_info": "Not available",
            "location": "Not specified",
            "time_of_incident": "Not specified",
            "method_of_operation": "Not specified",
            "damage_or_loss": "Not specified",
            "created_at": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat(),
            "query_count": 0,
            "comparisons": [],
            "fallback": True
        }
        _save_memory(memory)

        return {
            "case_id": case_id,
            "summary": memory[case_id],
            "status": "stored_fallback"
        }

    except Exception as e:
        print(f"[CASE MEMORY] ❌ Error: {e}")
        return {
            "case_id": case_id,
            "summary": None,
            "status": "error",
            "error": str(e)
        }


def get_case_memory(case_id: str) -> Optional[Dict]:
    """
    Retrieve a stored case summary from memory.

    Args:
        case_id: The case to retrieve.

    Returns:
        Case memory dictionary or None if not found.
    """
    memory = _load_memory()
    case_data = memory.get(case_id)

    if case_data:
        # Increment query count
        case_data["query_count"] = case_data.get("query_count", 0) + 1
        memory[case_id] = case_data
        _save_memory(memory)

    return case_data


def list_case_memories() -> List[Dict]:
    """
    List all stored case summaries with metadata.

    Returns a lightweight list (without full summaries) for
    the frontend to display available cases for comparison.

    Returns:
        List of case metadata dictionaries.
    """
    memory = _load_memory()
    cases = []

    for case_id, data in memory.items():
        cases.append({
            "case_id": case_id,
            "incident_type": data.get("incident_type", "unknown"),
            "location": data.get("location", "Not specified"),
            "time_of_incident": data.get("time_of_incident", "Not specified"),
            "created_at": data.get("created_at", ""),
            "last_updated": data.get("last_updated", ""),
            "query_count": data.get("query_count", 0),
            "comparisons_count": len(data.get("comparisons", [])),
            "has_summary": bool(data.get("detailed_summary"))
        })

    return cases


def compare_cases(case_id_a: str, case_id_b: str) -> Dict:
    """
    Compare two forensic cases using AI-powered analysis.

    This is the core cross-case comparison feature. It sends
    both case summaries to Groq LLM for comparative analysis.

    FLOW:
    ─────
    1. Load summaries for both cases from memory
    2. Build a structured comparison prompt
    3. Send to Groq LLM with comparative analysis instructions
    4. Parse JSON response
    5. Update comparison history in memory
    6. Return structured comparison

    Args:
        case_id_a: First case to compare.
        case_id_b: Second case to compare.

    Returns:
        Dictionary with similarities, differences, patterns,
        possible connections, and recommendations.
    """
    print(f"\n[CASE MEMORY] Comparing cases: {case_id_a} vs {case_id_b}")

    # ── Load both case summaries ──
    memory = _load_memory()

    case_a = memory.get(case_id_a)
    case_b = memory.get(case_id_b)

    if not case_a:
        return {
            "error": f"Case {case_id_a} not found in memory. "
                     "Please generate a summary first using the /api/memory/store endpoint.",
            "case_a": case_id_a,
            "case_b": case_id_b
        }

    if not case_b:
        return {
            "error": f"Case {case_id_b} not found in memory. "
                     "Please generate a summary first using the /api/memory/store endpoint.",
            "case_a": case_id_a,
            "case_b": case_id_b
        }

    # ── Build comparison text ──
    comparison_text = f"""
═══ CASE A: {case_id_a} ═══
Type: {case_a.get('incident_type', 'unknown')}
Location: {case_a.get('location', 'Not specified')}
Time: {case_a.get('time_of_incident', 'Not specified')}
Method: {case_a.get('method_of_operation', 'Not specified')}
Summary: {case_a.get('detailed_summary', 'No summary')}
Key Evidence: {json.dumps(case_a.get('key_evidence', []))}
Key Findings: {json.dumps(case_a.get('key_findings', []))}
Suspects: {case_a.get('suspects_info', 'None')}
Damage/Loss: {case_a.get('damage_or_loss', 'Not specified')}

═══ CASE B: {case_id_b} ═══
Type: {case_b.get('incident_type', 'unknown')}
Location: {case_b.get('location', 'Not specified')}
Time: {case_b.get('time_of_incident', 'Not specified')}
Method: {case_b.get('method_of_operation', 'Not specified')}
Summary: {case_b.get('detailed_summary', 'No summary')}
Key Evidence: {json.dumps(case_b.get('key_evidence', []))}
Key Findings: {json.dumps(case_b.get('key_findings', []))}
Suspects: {case_b.get('suspects_info', 'None')}
Damage/Loss: {case_b.get('damage_or_loss', 'Not specified')}
"""

    # ── LLM-based comparison ──
    try:
        last_err = None
        for attempt in range(3):
            try:
                response = _memory_client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": COMPARISON_PROMPT},
                        {"role": "user", "content": f"Compare these two forensic cases:\n{comparison_text}"}
                    ],
                    model=GROQ_MODEL,
                    temperature=0.3,
                    max_tokens=2048,
                )
                break
            except Exception as conn_err:
                last_err = conn_err
                print(f"[CASE MEMORY] Comparison attempt {attempt + 1}/3 failed: {conn_err}")
                if attempt < 2:
                    time.sleep(1)
        else:
            raise last_err  # type: ignore

        raw_response = response.choices[0].message.content.strip()

        # ── Parse JSON response ──
        json_text = raw_response
        if "```json" in json_text:
            json_text = json_text.split("```json")[1].split("```")[0].strip()
        elif "```" in json_text:
            json_text = json_text.split("```")[1].split("```")[0].strip()

        comparison_data = json.loads(json_text)

        # ── Update comparison history in memory ──
        if case_id_b not in case_a.get("comparisons", []):
            case_a.setdefault("comparisons", []).append(case_id_b)
        if case_id_a not in case_b.get("comparisons", []):
            case_b.setdefault("comparisons", []).append(case_id_a)
        memory[case_id_a] = case_a
        memory[case_id_b] = case_b
        _save_memory(memory)

        result = {
            "case_a": case_id_a,
            "case_b": case_id_b,
            "similarities": comparison_data.get("similarities", []),
            "differences": comparison_data.get("differences", []),
            "patterns": comparison_data.get("patterns", []),
            "possible_connections": comparison_data.get("possible_connections", []),
            "risk_assessment": comparison_data.get("risk_assessment", "Unknown"),
            "recommendation": comparison_data.get("recommendation", ""),
            "compared_at": datetime.now().isoformat()
        }

        print(f"[CASE MEMORY] Comparison complete:")
        print(f"  Similarities: {len(result['similarities'])}")
        print(f"  Differences: {len(result['differences'])}")
        print(f"  Patterns: {len(result['patterns'])}")
        print(f"  Risk: {result['risk_assessment']}")

        return result

    except json.JSONDecodeError as e:
        print(f"[CASE MEMORY] ⚠️  Comparison JSON parse error: {e}")
        return {
            "case_a": case_id_a,
            "case_b": case_id_b,
            "error": "Comparison analysis could not be parsed",
            "raw_analysis": raw_response[:2000] if 'raw_response' in dir() else "",
            "fallback": True
        }

    except Exception as e:
        print(f"[CASE MEMORY] ❌ Comparison error: {e}")
        return {
            "case_a": case_id_a,
            "case_b": case_id_b,
            "error": str(e)
        }


def clear_case_memory() -> None:
    """
    Clear all stored case memories.

    Called during full system reset to remove historical data.
    """
    if os.path.exists(CASE_MEMORY_PATH):
        os.remove(CASE_MEMORY_PATH)
        print("[CASE MEMORY] All case memories cleared")
    else:
        print("[CASE MEMORY] No memory file to clear")
