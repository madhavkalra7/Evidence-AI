# ============================================================
# RETRIEVAL METRICS — Precision, Recall, MRR for RAG Evaluation
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  THESE METRICS MEASURE HOW GOOD THE RETRIEVAL IS.       ║
# ║  Without evaluation, you can't know if RAG is working.  ║
# ╚══════════════════════════════════════════════════════════╝
#
# WHY EVALUATE RETRIEVAL IN RAG?
# ───────────────────────────────
#   RAG quality depends on TWO stages:
#     1. RETRIEVAL: Finding the right chunks from the database
#     2. GENERATION: LLM producing a good answer from those chunks
#
#   If retrieval is bad (wrong chunks), the LLM CANNOT produce
#   a good answer — no matter how smart it is. This is called
#   "Garbage In, Garbage Out" (GIGO).
#
#   Therefore, measuring retrieval quality is CRITICAL.
#   These three metrics capture different aspects of quality:
#
# ============================================================
# METRIC 1: PRECISION
# ============================================================
#
# DEFINITION:
#   Precision = Relevant Retrieved / Total Retrieved
#
# INTERPRETATION:
#   "Of all the chunks I retrieved, how many were actually useful?"
#
# EXAMPLE:
#   Retrieved 10 chunks. 6 are relevant. Precision = 6/10 = 0.60
#
# RANGE: [0.0, 1.0]
#   1.0 = Every retrieved chunk is relevant (perfect precision)
#   0.0 = No retrieved chunk is relevant (all noise)
#
# WHY IT MATTERS FOR RAG:
#   Low precision → LLM gets noisy/irrelevant chunks in context
#   → Answers are diluted or distracted by unrelated text.
#
# ============================================================
# METRIC 2: RECALL
# ============================================================
#
# DEFINITION:
#   Recall = Relevant Retrieved / Total Relevant (in database)
#
# INTERPRETATION:
#   "Of all the relevant chunks that exist, how many did I find?"
#
# EXAMPLE:
#   Database has 20 relevant chunks. Retrieved 6 of them.
#   Recall = 6/20 = 0.30
#
# RANGE: [0.0, 1.0]
#   1.0 = Found all relevant chunks (perfect recall)
#   0.0 = Found none of the relevant chunks (missed everything)
#
# WHY IT MATTERS FOR RAG:
#   Low recall → LLM misses important evidence → incomplete answers.
#   Hybrid retrieval (BM25 + Vector) improves recall by catching
#   chunks that one method alone would miss.
#
# PRECISION vs RECALL TRADEOFF:
#   ┌──────────┬────────────────────────────────────────────┐
#   │ High P   │ Few results, but all relevant.             │
#   │ Low R    │ Missed many relevant chunks.               │
#   ├──────────┼────────────────────────────────────────────┤
#   │ Low P    │ Many results, but mostly noise.            │
#   │ High R   │ Found all relevant chunks.                 │
#   ├──────────┼────────────────────────────────────────────┤
#   │ High P   │ IDEAL: Many relevant results,              │
#   │ High R   │ and we found all of them.                  │
#   └──────────┴────────────────────────────────────────────┘
#
# ============================================================
# METRIC 3: MEAN RECIPROCAL RANK (MRR)
# ============================================================
#
# DEFINITION:
#   MRR = 1 / rank_of_first_relevant_result
#
# INTERPRETATION:
#   "How quickly do I find the first useful result?"
#
# EXAMPLE:
#   First relevant chunk is at position 3 → MRR = 1/3 = 0.333
#   First relevant chunk is at position 1 → MRR = 1/1 = 1.000
#
# RANGE: [0.0, 1.0]
#   1.0 = First result is relevant (best possible)
#   0.5 = First relevant result at rank 2
#   0.0 = No relevant result found at all
#
# WHY IT MATTERS FOR RAG:
#   In RAG, the LLM processes chunks in order. If the first
#   chunk is irrelevant, the LLM may be "anchored" to wrong info.
#   High MRR means the most important chunk comes first.
#
# MRR vs PRECISION vs RECALL:
#   - Precision: Overall quality of entire result set
#   - Recall: Completeness of result set
#   - MRR: Quality of the TOP result (most critical for RAG)
# ============================================================


def compute_precision(relevant_retrieved: int, total_retrieved: int) -> float:
    """
    Compute Precision score.

    Precision = Relevant Retrieved / Total Retrieved

    Measures the PURITY of retrieved results.
    High precision = less noise in the LLM's context.

    Args:
        relevant_retrieved: Number of retrieved chunks that are relevant.
        total_retrieved:    Total number of chunks retrieved.

    Returns:
        Precision score in [0.0, 1.0].
        Returns 0.0 if total_retrieved is 0 (division by zero guard).
    """
    if total_retrieved == 0:
        return 0.0
    return relevant_retrieved / total_retrieved


def compute_recall(relevant_retrieved: int, total_relevant: int) -> float:
    """
    Compute Recall score.

    Recall = Relevant Retrieved / Total Relevant

    Measures the COMPLETENESS of retrieval.
    High recall = fewer important chunks are missed.

    Args:
        relevant_retrieved: Number of retrieved chunks that are relevant.
        total_relevant:     Total number of relevant chunks in the database.

    Returns:
        Recall score in [0.0, 1.0].
        Returns 0.0 if total_relevant is 0 (division by zero guard).
    """
    if total_relevant == 0:
        return 0.0
    return relevant_retrieved / total_relevant


def compute_mrr(rank: int) -> float:
    """
    Compute Mean Reciprocal Rank (MRR) for a single query.

    MRR = 1 / rank_of_first_relevant_result

    Measures how quickly the retrieval system surfaces a
    relevant result. Position 1 = best (MRR = 1.0).

    For a single query, MRR is simply the reciprocal of the
    rank of the first relevant result. For multiple queries,
    you would average MRR across all queries.

    Args:
        rank: The 1-based position of the first relevant result.
              0 means no relevant result was found.

    Returns:
        MRR score in [0.0, 1.0].
        Returns 0.0 if rank is 0 (no relevant result found).
    """
    if rank <= 0:
        return 0.0
    return 1.0 / rank
 