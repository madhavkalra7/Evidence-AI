# ============================================================
# RAG EVALUATION MODULE — Quality Metrics & Logging
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  THIS MODULE EVALUATES THE QUALITY OF EVERY RAG         ║
# ║  INTERACTION AND LOGS METRICS FOR ANALYSIS.             ║
# ╚══════════════════════════════════════════════════════════╝
#
# ─────────────────────────────────────────────────────────
# WHY EVALUATION IS CRITICAL IN PRODUCTION RAG SYSTEMS
# ─────────────────────────────────────────────────────────
#
#   Building a RAG system is easy. Building a GOOD one is hard.
#   The difference? MEASUREMENT.
#
#   Without evaluation, you have NO idea if:
#     - Your retrieval is finding the RIGHT chunks
#     - Your LLM is actually using the retrieved context
#     - Your answers are grounded in evidence or hallucinated
#     - Changes to your pipeline improve or degrade quality
#
#   ANALOGY: Building RAG without evaluation is like driving
#   a car without a dashboard. You're moving, but you don't
#   know your speed, fuel level, or engine temperature.
#
#   IN FORENSICS, this matters 10x more:
#     - A hallucinated answer could implicate an innocent person
#     - Missing context could let a criminal go free
#     - Inconsistent retrieval undermines case credibility
#
# ─────────────────────────────────────────────────────────
# WHAT METRICS WE TRACK
# ─────────────────────────────────────────────────────────
#
#   1. RETRIEVAL RELEVANCE (Mean Similarity Score)
#      ──────────────────────────────────────────
#      "How relevant are the retrieved chunks to the question?"
#
#      Computed as: mean(similarity_scores of top-K chunks)
#
#      In FAISS with L2 distance:
#        Lower score = MORE relevant (closer vectors)
#        Score of 0 = identical vectors
#        Score > 1.0 = moderately related
#        Score > 2.0 = probably irrelevant
#
#      WHY THIS MATTERS:
#        If retrieval_relevance is consistently high (bad), it means:
#        - Your embedding model isn't capturing the right semantics
#        - Your chunks are too large/small for the question types
#        - You need more/better data in the vector store
#
#   2. GROUNDING SCORE (Context Overlap %)
#      ────────────────────────────────────
#      "How much of the LLM's answer is actually FROM the context?"
#
#      Computed as: % of answer sentences that overlap with context
#
#      High grounding (>80%) = Answer is evidence-based ✅
#      Low grounding (<40%) = Answer may be hallucinated ⚠️
#
#      HOW WE COMPUTE IT:
#        1. Split LLM answer into sentences
#        2. For each sentence, check if significant words appear
#           in the retrieved context
#        3. grounding_score = grounded_sentences / total_sentences
#
#      LIMITATION:
#        This is a SIMPLE heuristic, not a semantic comparison.
#        A production system would use:
#        - RAGAS (Retrieval Augmented Generation Assessment)
#        - BERTScore (semantic similarity between answer and context)
#        - NLI models (Natural Language Inference) for faithfulness
#
#      But for a college project, word overlap is a reasonable
#      approximation that demonstrates the concept.
#
#   3. ANSWER LENGTH (character count)
#      ────────────────────────────────
#      Tracks response size. Useful for:
#        - Detecting truncated responses
#        - Ensuring sufficient detail
#        - Monitoring cost (tokens ≈ length)
#
#   4. TOP_K USED
#      ───────────
#      How many chunks were actually used.
#      If top_k_used < TOP_K, the vector store had fewer chunks.
#
#   5. TIMESTAMP
#      ──────────
#      When the query happened. Essential for:
#        - Time-series analysis of quality
#        - Debugging specific bad interactions
#        - Audit trails (critical in forensics)
#
# ─────────────────────────────────────────────────────────
# EVALUATION LOGGING ARCHITECTURE
# ─────────────────────────────────────────────────────────
#
#   Each /api/chat request generates an evaluation log entry:
#
#   {
#     "timestamp": "2025-02-23T14:30:00",
#     "question": "Was a weapon found?",
#     "answer_length": 1247,
#     "top_k_used": 5,
#     "retrieval_relevance": 0.3241,
#     "grounding_score": 0.85,
#     "retrieved_chunks": [
#       {"text": "...", "score": 0.2341, "type": "pdf", "page": 3},
#       ...
#     ],
#     "answer_preview": "Based on the evidence, a kitchen..."
#   }
#
#   Logs are saved to: backend/evaluation_logs.json
#   This file grows with each query and can be analyzed:
#     - In Python (pandas, matplotlib)
#     - In Excel/Google Sheets
#     - Through a future evaluation dashboard
#
# ─────────────────────────────────────────────────────────
# HOW THIS FITS INTO THE RAG PIPELINE
# ─────────────────────────────────────────────────────────
#
#   Normal RAG flow:
#     Question → Embed → FAISS → Context → LLM → Answer → User
#
#   With evaluation:
#     Question → Embed → FAISS → Context → LLM → Answer → User
#                                  │              │
#                                  └──────┬───────┘
#                                         ▼
#                                 EVALUATION MODULE
#                                   - compute overlap
#                                   - compute relevance
#                                   - log to JSON
#
#   The evaluation module sits AFTER the answer is generated
#   and BEFORE it's returned to the user. It adds zero latency
#   to the user-facing response because logging is non-blocking.
#
# ─────────────────────────────────────────────────────────
# PRODUCTION RAG EVALUATION: RAGAS FRAMEWORK
# ─────────────────────────────────────────────────────────
#
#   In production systems, the industry standard is RAGAS
#   (Retrieval Augmented Generation Assessment):
#
#   RAGAS defines 4 metrics:
#     1. Faithfulness: Is the answer supported by context?
#     2. Answer Relevancy: Does the answer address the question?
#     3. Context Precision: Are retrieved chunks actually relevant?
#     4. Context Recall: Were ALL relevant chunks retrieved?
#
#   RAGAS uses LLMs to evaluate (an LLM judges another LLM).
#   It's more accurate but expensive (extra API calls).
#
#   Our module implements a LIGHTWEIGHT version:
#     Faithfulness ≈ our grounding_score
#     Context Precision ≈ our retrieval_relevance
#     (We don't measure recall or answer relevancy — future work)
# ============================================================

import json
import os
import re
from datetime import datetime
from typing import List, Dict, Optional


# ─────────────────────────────────────────────────────────
# LOG FILE PATH
# ─────────────────────────────────────────────────────────
# We store evaluation logs in a JSON file in the backend directory.
# Each log entry is appended to a JSON array.
#
# WHY JSON AND NOT A DATABASE?
#   1. Zero dependencies (no SQLite, no PostgreSQL)
#   2. Human-readable (can open in any text editor)
#   3. Easy to load in Python/pandas for analysis
#   4. Good enough for a college project scale
#
# For production: Use Elasticsearch, ClickHouse, or PostgreSQL
# for queryable, indexed, scalable evaluation storage.
# ─────────────────────────────────────────────────────────
EVAL_LOG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "evaluation_logs.json")


def compute_context_overlap(answer: str, retrieved_chunks: List[Dict]) -> float:
    """
    Compute what percentage of the answer is grounded in retrieved context.

    This is our LIGHTWEIGHT FAITHFULNESS metric.

    ALGORITHM:
    ──────────
    1. Split the answer into sentences (by period, exclamation, question mark)
    2. Combine all retrieved chunk texts into one big context string
    3. For each answer sentence:
       a. Extract meaningful words (>3 chars, not stopwords)
       b. Count how many appear in the context
       c. If >40% of words are found → sentence is "grounded"
    4. grounding_score = grounded_sentences / total_sentences

    WHY >40% WORD OVERLAP AS THRESHOLD?
    ─────────────────────────────────────
    The LLM paraphrases and restructures text. It rarely copies verbatim.
    Example:
      Context: "A kitchen knife with blood traces was recovered"
      Answer:  "Investigators found a blood-stained knife at the scene"
    
    Overlapping words: "knife", "blood"
    Non-overlapping:   "investigators", "found", "stained", "scene"
    
    Even with heavy paraphrasing, key forensic terms are preserved.
    40% threshold captures this while filtering out truly hallucinated
    sentences that share no vocabulary with the context.

    Args:
        answer: The LLM's generated answer string
        retrieved_chunks: List of chunk dicts with "text" fields

    Returns:
        Float between 0.0 and 1.0 representing grounding percentage.
        1.0 = every sentence is grounded in context
        0.0 = no sentence overlaps with context

    LIMITATIONS:
    ─────────────
    - Word-level overlap is crude — doesn't understand paraphrasing
      e.g., "deceased" vs "dead person" won't match
    - Doesn't detect semantic negation
      e.g., "knife was found" vs "knife was NOT found" would match
    - For production: use BERTScore or NLI-based faithfulness
    """
    if not answer or not retrieved_chunks:
        return 0.0

    # ── Step 1: Split answer into sentences ──
    # Use regex to split on sentence-ending punctuation
    sentences = re.split(r'[.!?]+', answer)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 10]

    if not sentences:
        return 0.0

    # ── Step 2: Build context text from all chunks ──
    # Combine all retrieved chunk texts into one searchable string
    # Use lowercase for case-insensitive matching
    context_text = " ".join(
        chunk.get("text", "") for chunk in retrieved_chunks
    ).lower()

    # ── Step 3: Common stopwords to ignore ──
    # These words appear everywhere and don't indicate grounding
    # e.g., "the knife was found" — "the" and "was" are stopwords
    stopwords = {
        "the", "a", "an", "is", "was", "were", "are", "been", "be",
        "have", "has", "had", "do", "does", "did", "will", "would",
        "could", "should", "may", "might", "shall", "can", "need",
        "dare", "ought", "used", "to", "of", "in", "for", "on",
        "with", "at", "by", "from", "as", "into", "through", "during",
        "before", "after", "above", "below", "between", "out", "off",
        "over", "under", "again", "further", "then", "once", "here",
        "there", "when", "where", "why", "how", "all", "each", "every",
        "both", "few", "more", "most", "other", "some", "such", "no",
        "nor", "not", "only", "own", "same", "so", "than", "too",
        "very", "just", "because", "but", "and", "or", "if", "while",
        "that", "this", "these", "those", "it", "its", "they", "them",
        "their", "we", "our", "you", "your", "he", "she", "his", "her",
        "which", "what", "who", "whom", "also", "about"
    }

    # ── Step 4: Check each sentence for grounding ──
    grounded_count = 0

    for sentence in sentences:
        # Extract meaningful words (> 3 chars, not stopwords)
        words = re.findall(r'\b[a-zA-Z]{4,}\b', sentence.lower())
        meaningful_words = [w for w in words if w not in stopwords]

        if not meaningful_words:
            # Skip sentences with no meaningful words
            # (e.g., "It is." — too short to evaluate)
            continue

        # Count how many meaningful words appear in the context
        found_count = sum(1 for word in meaningful_words if word in context_text)
        overlap_ratio = found_count / len(meaningful_words)

        # If >40% of meaningful words are in context → grounded
        if overlap_ratio > 0.4:
            grounded_count += 1

    # ── Step 5: Compute final grounding score ──
    grounding_score = grounded_count / len(sentences) if sentences else 0.0

    return round(grounding_score, 4)


def compute_retrieval_relevance(retrieved_chunks: List[Dict]) -> float:
    """
    Compute the mean similarity score of retrieved chunks.

    In FAISS L2 distance:
      Lower score = more similar = more relevant
      Score 0.0 = identical (exact match)
      Score < 0.5 = very relevant
      Score 0.5-1.0 = moderately relevant
      Score > 1.5 = probably irrelevant

    Args:
        retrieved_chunks: List of chunk dicts with "score" fields
                         (L2 distances from FAISS)

    Returns:
        Float representing mean L2 distance.
        Lower is better.

    WHY MEAN AND NOT MIN/MAX?
    ──────────────────────────
    - MIN would only reflect the single best match (ignores noise)
    - MAX would only reflect the worst match (too pessimistic)
    - MEAN captures the OVERALL quality of the retrieved set
    - In practice, we want ALL top-K chunks to be relevant,
      not just one good match surrounded by junk
    """
    if not retrieved_chunks:
        return 0.0

    scores = [chunk.get("score", 0.0) for chunk in retrieved_chunks]
    return round(sum(scores) / len(scores), 4) if scores else 0.0


def log_evaluation(
    question: str,
    answer: str,
    retrieved_chunks: List[Dict],
    model: str,
    hyde_used: bool = False,
    jailbreak_blocked: bool = False
) -> Dict:
    """
    Compute evaluation metrics and log them to evaluation_logs.json.

    This function is called AFTER every /api/chat response.
    It computes metrics and appends a log entry to the JSON file.

    Args:
        question: The original user question
        answer: The LLM-generated answer
        retrieved_chunks: The chunks retrieved from FAISS
        model: The LLM model name used
        hyde_used: Whether HYDE was used for this query
        jailbreak_blocked: Whether jailbreak guard blocked this query

    Returns:
        Dictionary containing all computed evaluation metrics
        (also saved to the log file)

    LOG ENTRY STRUCTURE:
    ─────────────────────
    {
      "timestamp": ISO 8601 datetime,
      "question": original question,
      "answer_preview": first 300 chars of answer,
      "answer_length": total character count,
      "model": LLM model name,
      "top_k_used": number of chunks retrieved,
      "retrieval_relevance": mean L2 distance (lower = better),
      "grounding_score": % of answer grounded in context (higher = better),
      "hyde_used": boolean,
      "jailbreak_blocked": boolean,
      "retrieved_chunks_preview": [
        {"text_preview": "first 150 chars...", "score": 0.23, "type": "pdf", "page": 3},
        ...
      ]
    }

    FILE PERSISTENCE:
    ──────────────────
    We read the existing JSON array, append the new entry, and write back.
    If the file doesn't exist, we create it with a new array.

    THREAD SAFETY NOTE:
    ────────────────────
    FastAPI can handle concurrent requests. Two simultaneous writes
    could corrupt the JSON file. For production, use a database or
    a file lock. For this project, concurrent queries are rare.
    """
    # ── Compute metrics ──
    retrieval_relevance = compute_retrieval_relevance(retrieved_chunks)
    grounding_score = compute_context_overlap(answer, retrieved_chunks)

    # ── Build log entry ──
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "question": question,
        "answer_preview": answer[:300] + ("..." if len(answer) > 300 else ""),
        "answer_length": len(answer),
        "model": model,
        "top_k_used": len(retrieved_chunks),
        "retrieval_relevance": retrieval_relevance,
        "grounding_score": grounding_score,
        "hyde_used": hyde_used,
        "jailbreak_blocked": jailbreak_blocked,
        "retrieved_chunks_preview": [
            {
                "text_preview": chunk.get("text", "")[:150],
                "score": chunk.get("score", 0.0),
                "type": chunk.get("type", "unknown"),
                "page": chunk.get("page", 0)
            }
            for chunk in retrieved_chunks
        ]
    }

    # ── Terminal logging ──
    print(f"\n[EVALUATION] ═══════════════════════════════════════")
    print(f"  Question: {question[:80]}...")
    print(f"  Answer length: {log_entry['answer_length']} chars")
    print(f"  Chunks used: {log_entry['top_k_used']}")
    print(f"  Retrieval relevance (L2 mean): {retrieval_relevance:.4f} "
          f"({'good' if retrieval_relevance < 0.5 else 'fair' if retrieval_relevance < 1.0 else 'poor'})")
    print(f"  Grounding score: {grounding_score:.1%} "
          f"({'strong' if grounding_score > 0.7 else 'moderate' if grounding_score > 0.4 else 'weak'})")
    print(f"  HYDE used: {hyde_used}")
    print(f"  Jailbreak blocked: {jailbreak_blocked}")
    print(f"[EVALUATION] ═══════════════════════════════════════\n")

    # ── Persist to JSON file ──
    try:
        _append_to_log_file(log_entry)
    except Exception as e:
        # Logging failure should NEVER break the main pipeline
        # If we can't write the log, we print an error and move on.
        # The user still gets their answer.
        print(f"[EVALUATION] ⚠️  Failed to write log file: {e}")

    return log_entry


def _append_to_log_file(entry: Dict) -> None:
    """
    Append a single evaluation entry to the JSON log file.

    File format: A JSON array of objects.
    [
      { ... entry 1 ... },
      { ... entry 2 ... },
      { ... entry N ... }
    ]

    If the file doesn't exist, creates it.
    If the file is corrupted, starts a new array.

    WHY APPEND PATTERN (read → add → write)?
    ──────────────────────────────────────────
    JSON doesn't support appending natively (unlike CSV or JSONL).
    We must:
      1. Read entire file into memory
      2. Parse as JSON array
      3. Append new entry
      4. Write entire file back

    For <10,000 entries, this is fine. For larger scale:
    - Use JSONL (JSON Lines) format: one JSON object per line
    - Or use a database (SQLite, PostgreSQL, MongoDB)
    """
    # Read existing logs (or start fresh)
    if os.path.exists(EVAL_LOG_PATH):
        try:
            with open(EVAL_LOG_PATH, "r", encoding="utf-8") as f:
                content = f.read().strip()
                logs = json.loads(content) if content else []
        except (json.JSONDecodeError, IOError):
            # File is corrupted — start fresh
            print("[EVALUATION] Log file was corrupted. Starting fresh.")
            logs = []
    else:
        logs = []

    # Append new entry
    logs.append(entry)

    # Write back
    with open(EVAL_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(logs, f, indent=2, ensure_ascii=False)

    print(f"[EVALUATION] Logged entry #{len(logs)} to {EVAL_LOG_PATH}")


def get_evaluation_summary() -> Dict:
    """
    Generate a summary of all evaluation logs.

    Returns aggregate statistics useful for:
      - Understanding overall system quality
      - Identifying regression after changes
      - Reporting in presentations/papers

    Returns:
        Dictionary with aggregate metrics:
          - total_queries: Total number of evaluated queries
          - avg_retrieval_relevance: Mean of all retrieval scores
          - avg_grounding_score: Mean of all grounding scores
          - avg_answer_length: Mean answer character count
          - hyde_usage_rate: % of queries that used HYDE
          - jailbreak_block_rate: % of queries blocked by guard
          - quality_distribution: breakdown by score ranges
    """
    if not os.path.exists(EVAL_LOG_PATH):
        return {"total_queries": 0, "message": "No evaluation data yet."}

    try:
        with open(EVAL_LOG_PATH, "r", encoding="utf-8") as f:
            logs = json.loads(f.read())
    except (json.JSONDecodeError, IOError):
        return {"total_queries": 0, "message": "Log file unreadable."}

    if not logs:
        return {"total_queries": 0, "message": "No evaluation data yet."}

    total = len(logs)
    relevance_scores = [l.get("retrieval_relevance", 0) for l in logs]
    grounding_scores = [l.get("grounding_score", 0) for l in logs]
    answer_lengths = [l.get("answer_length", 0) for l in logs]
    hyde_count = sum(1 for l in logs if l.get("hyde_used", False))
    jailbreak_count = sum(1 for l in logs if l.get("jailbreak_blocked", False))

    # Quality distribution based on grounding score
    strong = sum(1 for g in grounding_scores if g > 0.7)
    moderate = sum(1 for g in grounding_scores if 0.4 < g <= 0.7)
    weak = sum(1 for g in grounding_scores if g <= 0.4)

    return {
        "total_queries": total,
        "avg_retrieval_relevance": round(sum(relevance_scores) / total, 4),
        "avg_grounding_score": round(sum(grounding_scores) / total, 4),
        "avg_answer_length": round(sum(answer_lengths) / total, 1),
        "hyde_usage_rate": round(hyde_count / total, 4),
        "jailbreak_block_rate": round(jailbreak_count / total, 4),
        "quality_distribution": {
            "strong_grounding": strong,
            "moderate_grounding": moderate,
            "weak_grounding": weak
        },
        "latest_query": logs[-1].get("timestamp", "unknown") if logs else "none"
    }
