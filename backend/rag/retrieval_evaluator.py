# ============================================================
# RETRIEVAL EVALUATOR — Evaluate RAG retrieval quality
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  THIS MODULE EVALUATES HOW WELL RETRIEVAL IS WORKING.   ║
# ║  It compares retrieved chunks against the query using    ║
# ║  SEMANTIC SIMILARITY (cosine similarity on embeddings).  ║
# ╚══════════════════════════════════════════════════════════╝
#
# WHY SEMANTIC SIMILARITY INSTEAD OF KEYWORD MATCHING?
# ──────────────────────────────────────────────────────
#   Keyword matching fails when the query and chunk use
#   DIFFERENT WORDS to describe the SAME CONCEPT:
#
#     Query: "How did the intruder enter?"
#     Chunk: "forced entry through the living room window"
#
#   Keyword match → 0% overlap → marked NOT relevant (WRONG!)
#   Semantic similarity → 0.72 → marked RELEVANT (CORRECT!)
#
#   This happens because embeddings capture MEANING, not just words.
#   The model knows "intruder enter" ≈ "forced entry" semantically.
#
# HOW COSINE SIMILARITY WORKS:
# ─────────────────────────────
#   1. Convert query → 384-dim vector (embedding)
#   2. Convert chunk → 384-dim vector (embedding)
#   3. Compute angle between the two vectors:
#
#      cosine_similarity = (A · B) / (||A|| × ||B||)
#
#   Range: -1 to +1
#     +1.0 = identical meaning
#      0.0 = completely unrelated
#     -1.0 = opposite meaning (rare in practice)
#
# WHY THRESHOLD ≈ 0.35?
# ──────────────────────
#   For all-MiniLM-L6-v2 sentence embeddings:
#     > 0.7  = very high similarity (near paraphrase)
#     > 0.5  = clearly related
#     > 0.35 = topically relevant (good for RAG evaluation)
#     < 0.3  = likely unrelated
#
#   We use 0.35 because in forensic RAG:
#     - Chunks are long paragraphs, queries are short questions
#     - A chunk may be relevant even if only part of it matches
#     - 0.35 catches semantic matches that keywords miss entirely
#     - Higher thresholds (0.5+) would miss many valid forensic matches
#       where technical detail in the chunk doesn't overlap with the question
#
# WHAT IS GROUND TRUTH?
# ──────────────────────
#   Ground truth = the chunks that SHOULD have been retrieved
#   for a given query. Provided via POST /api/evaluate endpoint.
# ============================================================

import json
import os
import sys
import numpy as np
from datetime import datetime
from typing import List, Dict
from rag.metrics import compute_precision, compute_recall, compute_mrr
from rag.embedding_engine import embed_text, compute_similarity
from config import RETRIEVAL_METRICS_LOG

# ── Semantic similarity threshold for relevance ──
# A chunk is considered "relevant" to the query if
# cosine_similarity(query_embedding, chunk_embedding) > this value.
SIMILARITY_THRESHOLD = 0.35


def _is_relevant(retrieved_text: str, ground_truth_chunks: List[str], threshold: float = 0.5) -> bool:
    """
    Determine if a retrieved chunk is relevant by checking semantic
    similarity against ground truth chunks using embeddings.

    Uses cosine similarity between the retrieved chunk's embedding
    and each ground truth chunk's embedding. If any pair exceeds
    the threshold, the chunk is considered relevant.

    Args:
        retrieved_text:      Text of the retrieved chunk.
        ground_truth_chunks: List of ground truth chunk texts.
        threshold:           Minimum cosine similarity to count as relevant.

    Returns:
        True if the retrieved chunk semantically matches any ground truth chunk.
    """
    if not retrieved_text.strip() or not ground_truth_chunks:
        return False

    retrieved_emb = embed_text(retrieved_text)[0]

    for gt_text in ground_truth_chunks:
        if not gt_text.strip():
            continue
        gt_emb = embed_text(gt_text)[0]
        sim = compute_similarity(retrieved_emb, gt_emb)
        if sim >= threshold:
            return True

    return False


def evaluate_query(
    query: str,
    retrieved_chunks: List[Dict],
    ground_truth_chunks: List[str]
) -> Dict:
    """
    Evaluate retrieval quality for a single query.

    EVALUATION PIPELINE:
    ─────────────────────
    1. Compare each retrieved chunk against all ground truth chunks
    2. Count relevant retrieved (match ≥ 50% token overlap)
    3. Find rank of first relevant result (for MRR)
    4. Compute Precision, Recall, MRR
    5. Log results to retrieval_metrics_log.json

    Args:
        query:               The query that was used for retrieval.
        retrieved_chunks:    List of retrieved chunk dicts (with "text" key).
        ground_truth_chunks: List of ground truth chunk texts (strings).

    Returns:
        Dictionary with:
          - "precision": float
          - "recall": float
          - "mrr": float
          - "relevant_retrieved": int
          - "total_retrieved": int
          - "total_relevant": int
    """
    total_retrieved = len(retrieved_chunks)
    total_relevant = len(ground_truth_chunks)

    # ── Find relevant retrieved chunks and first relevant rank ──
    relevant_retrieved = 0
    first_relevant_rank = 0  # 0 = not found

    for i, chunk in enumerate(retrieved_chunks):
        chunk_text = chunk.get("text", "")
        if _is_relevant(chunk_text, ground_truth_chunks):
            relevant_retrieved += 1
            if first_relevant_rank == 0:
                first_relevant_rank = i + 1  # 1-based rank

    # ── Compute metrics ──
    precision = compute_precision(relevant_retrieved, total_retrieved)
    recall = compute_recall(relevant_retrieved, total_relevant)
    mrr = compute_mrr(first_relevant_rank)

    # ── Build result ──
    result = {
        "query": query,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "mrr": round(mrr, 4),
        "relevant_retrieved": relevant_retrieved,
        "total_retrieved": total_retrieved,
        "total_relevant": total_relevant,
        "first_relevant_rank": first_relevant_rank,
        "evaluation_type": "ground_truth",
        "timestamp": datetime.utcnow().isoformat(),
    }

    # ── Console output for screenshot capture ──
    _print_metrics(result)

    # ── Log to retrieval_metrics_log.json ──
    _log_metrics(result)

    return result


def _log_metrics(result: Dict):
    """
    Append evaluation metrics to retrieval_metrics_log.json.

    This creates a chronological log of all retrieval evaluations,
    enabling trend analysis and regression detection over time.

    The log file is a JSON array of evaluation records.

    Args:
        result: Evaluation result dictionary to log.
    """
    logs = []

    # Load existing logs if file exists
    if os.path.exists(RETRIEVAL_METRICS_LOG):
        try:
            with open(RETRIEVAL_METRICS_LOG, "r") as f:
                logs = json.load(f)
                if not isinstance(logs, list):
                    logs = []
        except (json.JSONDecodeError, IOError):
            logs = []

    # Append new result
    logs.append(result)

    # Write back to file
    try:
        with open(RETRIEVAL_METRICS_LOG, "w") as f:
            json.dump(logs, f, indent=2)
        print(f"[EVALUATOR] Metrics logged to {RETRIEVAL_METRICS_LOG}")
    except IOError as e:
        print(f"[EVALUATOR] Failed to log metrics: {e}")


def get_metrics_history() -> List[Dict]:
    """
    Read all historical evaluation metrics from the log file.

    Returns:
        List of evaluation result dictionaries, oldest first.
    """
    if not os.path.exists(RETRIEVAL_METRICS_LOG):
        return []

    try:
        with open(RETRIEVAL_METRICS_LOG, "r") as f:
            logs = json.load(f)
            return logs if isinstance(logs, list) else []
    except (json.JSONDecodeError, IOError):
        return []


def auto_evaluate_retrieval(
    query: str,
    answer: str,
    retrieved_chunks: List[Dict],
    case_id: str = "default"
) -> Dict:
    """
    Auto-evaluate retrieval quality using SEMANTIC SIMILARITY
    between the user's query and each retrieved chunk.

    Runs on EVERY chat query — no manual ground truth needed.

    SEMANTIC EVALUATION STRATEGY:
    ──────────────────────────────
    1. Embed the user's query → 384-dim vector
    2. Embed each retrieved chunk → 384-dim vector
    3. Compute cosine similarity between query and each chunk
    4. If similarity > SIMILARITY_THRESHOLD (0.35) → chunk is relevant

    WHY THIS WORKS:
    ────────────────
    Unlike keyword matching, semantic similarity catches cases like:
      Query: "How did the intruder enter?"
      Chunk: "forced entry through the living room window"
      → cosine_similarity = 0.72 → RELEVANT ✓

    Keyword matching would give 0% overlap → NOT relevant ✗

    The embedding model (all-MiniLM-L6-v2) understands that
    "intruder enter" and "forced entry" mean the same thing.
    """
    total_retrieved = len(retrieved_chunks)
    if total_retrieved == 0:
        empty_result = {
            "precision": 0.0, "recall": 0.0, "mrr": 0.0,
            "relevant_retrieved": 0, "total_retrieved": 0,
            "total_relevant": 0, "first_relevant_rank": 0,
        }
        _print_metrics(empty_result)
        return empty_result

    # ── Step 1: Embed the query once ──
    query_embedding = embed_text(query)[0]

    # ── Step 2: Embed all chunk texts in one batch (efficient) ──
    chunk_texts = [c.get("text", "") for c in retrieved_chunks]
    chunk_embeddings = embed_text(chunk_texts)

    # ── Step 3: Compute cosine similarity for each chunk ──
    relevant_retrieved = 0
    first_relevant_rank = 0

    print("\n[EVALUATOR] Chunk-by-chunk semantic similarity:")
    for i, chunk in enumerate(retrieved_chunks):
        sim = compute_similarity(query_embedding, chunk_embeddings[i])
        is_relevant = sim >= SIMILARITY_THRESHOLD

        # Per-chunk similarity log for debugging
        status = "relevant" if is_relevant else "not relevant"
        print(f"  Chunk {i+1} similarity: {sim:.2f} → {status}")

        if is_relevant:
            relevant_retrieved += 1
            if first_relevant_rank == 0:
                first_relevant_rank = i + 1

    # total_relevant = retrieval budget (how many we retrieved)
    total_relevant = total_retrieved

    # ── Step 4: Compute Precision, Recall, MRR ──
    precision = compute_precision(relevant_retrieved, total_retrieved)
    recall = compute_recall(relevant_retrieved, total_relevant)
    mrr = compute_mrr(first_relevant_rank)

    result = {
        "query": query,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "mrr": round(mrr, 4),
        "relevant_retrieved": relevant_retrieved,
        "total_retrieved": total_retrieved,
        "total_relevant": total_relevant,
        "first_relevant_rank": first_relevant_rank,
        "case_id": case_id,
        "timestamp": datetime.utcnow().isoformat(),
    }

    _print_metrics(result)
    _log_metrics(result)

    return result


def _print_metrics(result: Dict):
    """Print metrics to console for academic screenshot capture."""
    print("\n" + "=" * 50)
    print("   RETRIEVAL EVALUATION METRICS")
    print("=" * 50)
    print(f"   Precision : {result.get('precision', 0):.4f}")
    print(f"   Recall    : {result.get('recall', 0):.4f}")
    print(f"   MRR       : {result.get('mrr', 0):.4f}")
    print(f"   Relevant  : {result.get('relevant_retrieved', 0)} / {result.get('total_retrieved', 0)}")
    print(f"   1st Match : Rank {result.get('first_relevant_rank', 0)}")
    print("=" * 50 + "\n")
    sys.stdout.flush()
