# ============================================================
# CASE SUPERVISOR — Intelligent Case Isolation & Auto-Linking
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  THIS MODULE PREVENTS CROSS-INCIDENT CONTAMINATION      ║
# ║  BY AUTOMATICALLY ORGANIZING UPLOADS INTO ISOLATED      ║
# ║  CASES USING SEMANTIC SIMILARITY.                       ║
# ╚══════════════════════════════════════════════════════════╝
#
# ─────────────────────────────────────────────────────────
# THE PROBLEM: CROSS-INCIDENT CONTAMINATION
# ─────────────────────────────────────────────────────────
#
#   Without case isolation, ALL uploads go into ONE shared index.
#   If an investigator uploads evidence from Case A (burglary)
#   and then Case B (arson), the RAG pipeline will mix evidence:
#
#     Question about Case B: "What weapon was used?"
#     RAG retrieves: Kitchen knife from Case A (wrong case!)
#
#   This is called CROSS-INCIDENT CONTAMINATION and is a
#   critical forensic integrity issue. A wrongly attributed
#   piece of evidence could compromise an entire investigation.
#
# ─────────────────────────────────────────────────────────
# THE SOLUTION: CASE-LEVEL COLLECTION ISOLATION
# ─────────────────────────────────────────────────────────
#
#   Each forensic case gets its OWN ChromaDB collection.
#   Collections are completely isolated — queries in Case A
#   NEVER see documents from Case B.
#
#   Architecture:
#     ChromaDB
#       ├── Collection: "case_FR-001-2026" (burglary)
#       │   ├── PDF chunks from incident report
#       │   └── Image chunks from scene photos
#       │
#       ├── Collection: "case_FR-002-2026" (arson)
#       │   ├── PDF chunks from fire report
#       │   └── Image chunks from fire scene
#       │
#       └── Collection: "case_FR-003-2026" (homicide)
#           ├── PDF chunks from autopsy report
#           └── Image chunks from crime scene
#
# ─────────────────────────────────────────────────────────
# HOW AUTO-LINKING WORKS
# ─────────────────────────────────────────────────────────
#
#   When a file is uploaded, the Case Supervisor:
#
#   1. Generates a SHORT SUMMARY (~150 words) of the content
#      using Groq LLM. This captures the "essence" of the document.
#
#   2. EMBEDS the summary into a 384-dimensional vector.
#
#   3. COMPARES this embedding against all existing case summary
#      embeddings using COSINE SIMILARITY.
#
#   4. DECISION:
#      - If max_similarity > 0.80 → ATTACH to that existing case
#        (the upload is about the same incident)
#      - If max_similarity ≤ 0.80 → CREATE a new case
#        (the upload is about a different incident)
#
#   COSINE SIMILARITY MATH:
#   ────────────────────────
#     cos_sim(A, B) = (A · B) / (||A|| × ||B||)
#
#     Range: -1 to +1
#       1.0  = identical topic
#       0.80 = very similar (same incident, different angle)
#       0.50 = somewhat related (same crime type, different case)
#       0.0  = unrelated
#
#     WHY 0.80 THRESHOLD?
#       Too high (0.95): Would create separate cases for
#         the same incident's PDF and photo (they use different words)
#       Too low (0.60): Would merge unrelated burglary cases
#         just because they share "forced entry" vocabulary
#       0.80: Sweet spot — catches same-incident uploads while
#         keeping different incidents apart
#
# ─────────────────────────────────────────────────────────
# SESSION-LEVEL STATE
# ─────────────────────────────────────────────────────────
#
#   We maintain a mapping: session_id → case_id
#
#   WHY SESSION STATE?
#     A user uploads a PDF → creates/links to Case A
#     Same user uploads an image → should go to Case A
#     (not create a new case just because it's a different file type)
#
#   Without session state, each upload would be evaluated
#   independently, and an image of the same crime scene
#   might not meet the 0.80 threshold with the PDF's summary
#   (different modalities = different vocabulary).
#
#   Session state ensures: "If you already have an active case
#   in this session, new uploads default to that case UNLESS
#   the content is clearly about a different incident."
#
# ─────────────────────────────────────────────────────────
# CASE REGISTRY (case_registry.json)
# ─────────────────────────────────────────────────────────
#
#   Persistent storage for case metadata:
#   {
#     "CASE-20260224-a1b2c3": {
#       "summary_embedding": [0.12, -0.33, ...],  # 384-dim vector
#       "description": "Burglary at 221B West Ridge Apartments...",
#       "created_at": "2026-02-24T14:30:00",
#       "file_count": 3
#     },
#     "CASE-20260224-d4e5f6": {
#       "summary_embedding": [...],
#       "description": "Arson incident at warehouse district...",
#       "created_at": "2026-02-24T15:45:00",
#       "file_count": 2
#     }
#   }
#
#   This registry allows the supervisor to compare new uploads
#   against ALL existing cases without querying each collection.
# ============================================================

import json
import os
import uuid
import numpy as np
from datetime import datetime
from typing import Dict, Optional, Tuple, List
from groq import Groq
from config import GROQ_API_KEY, GROQ_MODEL, CASE_SIMILARITY_THRESHOLD
from rag.embedding_engine import embed_text
import time


# ── Groq client for summary generation ──
_supervisor_client = Groq(api_key=GROQ_API_KEY)

# ── Path to persistent case registry ──
CASE_REGISTRY_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "case_registry.json"
)

# ── In-memory session → case mapping ──
# Maps session_id (string) to case_id (string)
# This lives in server memory and resets on restart.
# For production: use Redis or a database for persistence.
session_active_case: Dict[str, str] = {}


# ============================================================
# SUMMARY GENERATION PROMPT
# ============================================================
# This prompt instructs the LLM to create a concise summary
# of the uploaded content for case matching purposes.
#
# KEY DESIGN DECISIONS:
#   1. "Max 150 words" — keeps embeddings focused
#   2. "Include case details" — case IDs, locations, dates
#      are the strongest signals for case matching
#   3. "Extract key entities" — names, addresses, evidence
#      help differentiate similar crime types
#   4. Temperature 0.1 — extremely low for deterministic summaries
# ============================================================

SUMMARY_PROMPT = """You are a forensic document summarizer.
Given the text content of an uploaded document (either a forensic PDF report 
or an AI-generated description of a crime scene image), produce a concise 
summary in under 150 words.

RULES:
- Include case ID, date, location if mentioned
- Include key evidence items and findings
- Include type of incident (burglary, arson, homicide, etc.)
- Include names of involved parties if mentioned
- Write in third person, past tense
- Be factual and specific — avoid general statements
- Do NOT add analysis or recommendations

PURPOSE: This summary will be embedded for automatic case matching.
Use specific vocabulary that distinguishes this incident from others."""


def _load_registry() -> Dict:
    """
    Load the case registry from disk.

    Returns:
        Dictionary mapping case_id → case metadata.
        Empty dict if file doesn't exist or is corrupted.

    FILE FORMAT:
        {
          "CASE-20260224-a1b2c3": {
            "summary_embedding": [...],
            "description": "...",
            "created_at": "...",
            "file_count": N
          }
        }
    """
    if not os.path.exists(CASE_REGISTRY_PATH):
        return {}

    try:
        with open(CASE_REGISTRY_PATH, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return json.loads(content) if content else {}
    except (json.JSONDecodeError, IOError) as e:
        print(f"[CASE SUPERVISOR] ⚠️  Registry corrupted, starting fresh: {e}")
        return {}


def _save_registry(registry: Dict) -> None:
    """
    Save the case registry to disk.

    Writes the entire registry as a JSON object.
    Thread safety: For production, use file locking or a database.
    """
    with open(CASE_REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
    print(f"[CASE SUPERVISOR] Registry saved ({len(registry)} cases)")


def _generate_case_id() -> str:
    """
    Generate a unique case ID.

    Format: CASE-YYYYMMDD-XXXXXX
    where XXXXXX is a random 6-character hex string.

    Examples:
        CASE-20260224-a1b2c3
        CASE-20260224-f7e8d9
    """
    date_str = datetime.now().strftime("%Y%m%d")
    unique_part = uuid.uuid4().hex[:6]
    return f"CASE-{date_str}-{unique_part}"


def generate_content_summary(content_text: str) -> str:
    """
    Generate a short summary of uploaded content using Groq LLM.

    This summary captures the "essence" of the document for
    case matching. The embedding of this summary is compared
    against existing case embeddings to decide whether to
    attach to an existing case or create a new one.

    Args:
        content_text: The full text content of the upload
                     (PDF extracted text or image AI description)

    Returns:
        A concise summary string (max ~150 words).

    FLOW:
        Content text (2000+ chars)
            → Groq LLM (temp=0.1)
            → Summary (150 words)
            → Will be embedded for cosine similarity matching

    WHY LLM SUMMARY AND NOT JUST EMBED THE FULL TEXT?
    ──────────────────────────────────────────────────
    Full document embeddings are "blurry" — they average over
    many topics. A focused summary embedding is sharper and
    better captures the incident identity (case ID, location,
    crime type) for matching purposes.
    """
    # Truncate to first 3000 chars to stay within token limits
    # and focus on the most identifying content (usually the header)
    truncated = content_text[:3000]

    print(f"[CASE SUPERVISOR] Generating content summary ({len(truncated)} chars input)")

    try:
        last_err = None
        for attempt in range(3):
            try:
                response = _supervisor_client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": SUMMARY_PROMPT},
                        {"role": "user", "content": f"Summarize this forensic document:\n\n{truncated}"}
                    ],
                    model=GROQ_MODEL,
                    temperature=0.1,
                    max_tokens=300,
                )
                break
            except Exception as conn_err:
                last_err = conn_err
                print(f"[CASE SUPERVISOR] Summary attempt {attempt + 1}/3 failed: {conn_err}")
                if attempt < 2:
                    time.sleep(1)
        else:
            raise last_err  # type: ignore

        summary = response.choices[0].message.content.strip()
        print(f"[CASE SUPERVISOR] Summary generated ({len(summary)} chars):")
        print(f"  '{summary[:120]}...'")
        return summary

    except Exception as e:
        # Fallback: use first 300 chars of content as summary
        print(f"[CASE SUPERVISOR] ⚠️  Summary generation failed: {e}")
        fallback = content_text[:300].strip()
        print(f"[CASE SUPERVISOR] Using fallback summary (first 300 chars)")
        return fallback


def _compute_cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """
    Compute cosine similarity between two embedding vectors.

    MATH:
    ─────
    cos_sim(A, B) = (A · B) / (||A|| × ||B||)

    WHERE:
      A · B = dot product = Σ(aᵢ × bᵢ)
      ||A|| = L2 norm = √(Σ(aᵢ²))

    RANGE:
      +1.0 = vectors point in same direction (identical meaning)
       0.0 = vectors are perpendicular (unrelated)
      -1.0 = vectors point in opposite directions (opposite meaning)

    WHY COSINE AND NOT L2 FOR CASE MATCHING?
    ──────────────────────────────────────────
    L2 distance is affected by vector magnitude.
    A longer document might produce a larger-magnitude summary embedding.
    Cosine similarity normalizes by magnitude, so it measures
    DIRECTION only — which is what we want for topic matching.

    In FAISS we use L2 for chunk retrieval (where magnitude is consistent
    because chunks are similar size). For case matching, cosine is safer.
    """
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))


def find_or_create_case(
    content_text: str,
    session_id: str = "default"
) -> Tuple[str, bool, str]:
    """
    Determine which case this upload belongs to.

    This is the CORE FUNCTION of the Case Supervisor.
    It implements the auto-linking algorithm:

    ALGORITHM:
    ──────────
    1. If session already has an active case:
       a. Generate summary of new content
       b. Compare with active case's summary embedding
       c. If similarity > threshold → attach to active case
       d. If similarity ≤ threshold → check ALL cases (might be returning to old case)

    2. If no active session case (or active case didn't match):
       a. Generate summary embedding
       b. Compare against ALL case registry embeddings
       c. If best_match > threshold → attach to that case
       d. Otherwise → create new case

    Args:
        content_text: Full text of the uploaded content
        session_id:   Session identifier for state tracking

    Returns:
        Tuple of (case_id, is_new_case, description):
          - case_id: The assigned case ID string
          - is_new_case: True if a new case was created
          - description: The generated summary/description

    FLOW DIAGRAM:
    ──────────────
    Upload → Generate Summary → Embed Summary
                                    │
                        ┌───────────┴────────────┐
                        ▼                        ▼
                Session has           No active session
                active case?              case
                    │                        │
                    ▼                        ▼
             Compare with             Compare with ALL
             active case              registry cases
                    │                        │
                ┌───┴───┐              ┌─────┴─────┐
                ▼       ▼              ▼           ▼
            sim>0.80  sim≤0.80    best>0.80    best≤0.80
                │       │            │            │
                ▼       ▼            ▼            ▼
            ATTACH   Check ALL    ATTACH      CREATE NEW
            to case  cases (→)    to match    case
    """
    print(f"\n[CASE SUPERVISOR] ═══════════════════════════════════════")
    print(f"[CASE SUPERVISOR] Processing upload for session: {session_id}")

    # ── Step 1: Generate summary and embedding ──
    summary = generate_content_summary(content_text)
    summary_embedding = embed_text(summary)

    # Ensure 1D array
    if isinstance(summary_embedding, np.ndarray) and summary_embedding.ndim > 1:
        summary_embedding = summary_embedding[0]

    # ── Step 2: Load existing case registry ──
    registry = _load_registry()

    # ── Step 3: Check session's active case first ──
    active_case_id = session_active_case.get(session_id)

    if active_case_id and active_case_id in registry:
        # Compare with active case
        active_case = registry[active_case_id]
        active_embedding = np.array(active_case["summary_embedding"], dtype=np.float32)
        similarity = _compute_cosine_similarity(summary_embedding, active_embedding)

        print(f"[CASE SUPERVISOR] Active case: {active_case_id}")
        print(f"[CASE SUPERVISOR] Similarity with active case: {similarity:.4f}")

        if similarity > CASE_SIMILARITY_THRESHOLD:
            # Content matches active case — attach
            registry[active_case_id]["file_count"] = registry[active_case_id].get("file_count", 1) + 1
            _save_registry(registry)

            print(f"[CASE SUPERVISOR] ✅ ATTACHED to active case: {active_case_id}")
            print(f"[CASE SUPERVISOR] ═══════════════════════════════════════\n")
            return active_case_id, False, active_case["description"]

    # ── Step 4: Compare against ALL existing cases ──
    best_match_id = None
    best_similarity = -1.0

    for case_id, case_data in registry.items():
        case_embedding = np.array(case_data["summary_embedding"], dtype=np.float32)
        sim = _compute_cosine_similarity(summary_embedding, case_embedding)

        print(f"[CASE SUPERVISOR] vs {case_id}: similarity={sim:.4f}")

        if sim > best_similarity:
            best_similarity = sim
            best_match_id = case_id

    # ── Step 5: Decision — attach or create ──
    if best_match_id and best_similarity > CASE_SIMILARITY_THRESHOLD:
        # Content matches an existing case — attach
        registry[best_match_id]["file_count"] = registry[best_match_id].get("file_count", 1) + 1
        _save_registry(registry)

        # Update session state
        session_active_case[session_id] = best_match_id

        print(f"[CASE SUPERVISOR] ✅ MATCHED existing case: {best_match_id} "
              f"(similarity: {best_similarity:.4f})")
        print(f"[CASE SUPERVISOR] ═══════════════════════════════════════\n")
        return best_match_id, False, registry[best_match_id]["description"]

    else:
        # No match — create new case
        new_case_id = _generate_case_id()

        registry[new_case_id] = {
            "summary_embedding": summary_embedding.tolist(),
            "description": summary,
            "created_at": datetime.now().isoformat(),
            "file_count": 1
        }
        _save_registry(registry)

        # Update session state
        session_active_case[session_id] = new_case_id

        print(f"[CASE SUPERVISOR] 🆕 CREATED new case: {new_case_id}")
        if best_match_id:
            print(f"[CASE SUPERVISOR]    Best match was {best_match_id} "
                  f"(similarity: {best_similarity:.4f} < threshold {CASE_SIMILARITY_THRESHOLD})")
        else:
            print(f"[CASE SUPERVISOR]    No existing cases in registry")
        print(f"[CASE SUPERVISOR] ═══════════════════════════════════════\n")
        return new_case_id, True, summary


def get_session_case(session_id: str = "default") -> Optional[str]:
    """
    Get the active case ID for a given session.

    Args:
        session_id: The session identifier.

    Returns:
        case_id string if session has an active case, None otherwise.
    """
    return session_active_case.get(session_id)


def set_session_case(session_id: str, case_id: str) -> None:
    """
    Explicitly set the active case for a session.

    Used when user manually selects a case or when
    the system needs to override auto-linking.

    Args:
        session_id: The session identifier.
        case_id:    The case to activate.
    """
    session_active_case[session_id] = case_id
    print(f"[CASE SUPERVISOR] Session {session_id} → active case: {case_id}")


def list_cases() -> Dict:
    """
    List all registered cases with their metadata.

    Returns:
        Dictionary mapping case_id → case info (without embeddings).
        Embeddings are excluded because they're large (384 floats)
        and not useful for display.
    """
    registry = _load_registry()
    cases = {}

    for case_id, case_data in registry.items():
        cases[case_id] = {
            "description": case_data.get("description", "No description"),
            "created_at": case_data.get("created_at", "unknown"),
            "file_count": case_data.get("file_count", 0)
        }

    return cases


def clear_all_cases() -> None:
    """
    Delete all cases and reset session state.
    Used by the /api/reset endpoint.
    """
    global session_active_case
    session_active_case = {}

    if os.path.exists(CASE_REGISTRY_PATH):
        os.remove(CASE_REGISTRY_PATH)
        print("[CASE SUPERVISOR] Registry file deleted")

    print("[CASE SUPERVISOR] All cases and sessions cleared")
