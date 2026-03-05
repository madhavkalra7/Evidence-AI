# ============================================================
# HYBRID RETRIEVER — Combines Vector Search + BM25 Keyword Search
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  THIS IS THE FUSION LAYER OF THE RETRIEVAL PIPELINE.    ║
# ║  It merges semantic (vector) and lexical (BM25) results ║
# ║  into a single ranked list for the LLM.                 ║
# ╚══════════════════════════════════════════════════════════╝
#
# HYBRID RETRIEVAL — WHY IT MATTERS
# ───────────────────────────────────
#   In Information Retrieval research, there are two paradigms:
#
#   ┌─────────────────────────┬──────────────────────────────┐
#   │   SPARSE RETRIEVAL      │   DENSE RETRIEVAL            │
#   │   (BM25 / TF-IDF)       │   (Embeddings / Vectors)     │
#   ├─────────────────────────┼──────────────────────────────┤
#   │ Exact keyword matching   │ Semantic meaning matching    │
#   │ "knife" → "knife"       │ "knife" → "blade", "weapon"  │
#   │ Fast, interpretable      │ Captures paraphrases         │
#   │ Misses synonyms          │ May miss exact terms (GSR)   │
#   │ No training needed       │ Requires embedding model     │
#   │ Proven since the 1990s   │ State-of-the-art since 2019  │
#   └─────────────────────────┴──────────────────────────────┘
#
#   HYBRID RETRIEVAL combines both:
#     Query → Vector Search (Top-K semantic matches)
#           → BM25 Search   (Top-K keyword matches)
#           → Merge + Deduplicate
#           → Combined ranking
#           → Top-K final results → LLM
#
#   Research evidence (Karpukhin et al., 2020; Ma et al., 2021):
#     - BM25 alone: ~65% recall@10
#     - Dense alone: ~72% recall@10
#     - Hybrid:      ~82% recall@10  ← 15-25% improvement
#
#   For forensic RAG specifically:
#     - Investigators use exact terminology ("luminol", "GSR", "stippling")
#     - They also ask semantic questions ("Was there evidence of forced entry?")
#     - Hybrid retrieval handles BOTH patterns well.
#
# SCORE COMBINATION STRATEGY
# ───────────────────────────
#   We use WEIGHTED LINEAR COMBINATION with MIN-MAX NORMALIZATION:
#
#   Step 1: Normalize vector scores to [0, 1]
#     norm_vector = (score - min_score) / (max_score - min_score)
#     NOTE: ChromaDB returns L2 distances (lower = better),
#     so we INVERT: norm_vector = 1 - normalized_distance
#
#   Step 2: Normalize BM25 scores to [0, 1]
#     norm_bm25 = (score - min_score) / (max_score - min_score)
#     NOTE: BM25 scores are higher = better (no inversion needed)
#
#   Step 3: Combine
#     combined = VECTOR_WEIGHT × norm_vector + BM25_WEIGHT × norm_bm25
#
#   Defaults: VECTOR_WEIGHT = 0.6, BM25_WEIGHT = 0.4
#   This gives semantic search slightly more influence, which is
#   appropriate for forensic questions that are often conceptual.
#
# DEDUPLICATION
# ──────────────
#   The same chunk can appear in BOTH vector and BM25 results.
#   When this happens, we KEEP the one with the higher combined score.
#   Deduplication is by exact text match (normalized whitespace).
# ============================================================

from typing import List, Dict
from rag.vector_store import vector_store
from rag.bm25_engine import bm25_engine
from config import (
    TOP_K,
    USE_HYBRID_RETRIEVAL,
    VECTOR_WEIGHT,
    BM25_WEIGHT,
)


def _normalize_scores(results: List[Dict], invert: bool = False) -> List[Dict]:
    """
    Normalize scores to [0, 1] range using min-max normalization.

    MIN-MAX NORMALIZATION:
    ──────────────────────
      normalized = (value - min) / (max - min)

    If invert=True (for distance metrics where lower = better):
      normalized = 1 - (value - min) / (max - min)

    This ensures that regardless of the original score scale,
    both vector and BM25 scores contribute proportionally.

    Args:
        results: List of result dicts with "score" field.
        invert:  If True, lower raw scores → higher normalized scores.
                 Set True for ChromaDB L2 distances.

    Returns:
        Same list with "normalized_score" added to each dict.
    """
    if not results:
        return results

    scores = [r["score"] for r in results]
    min_score = min(scores)
    max_score = max(scores)
    score_range = max_score - min_score

    for r in results:
        if score_range == 0:
            # All scores identical → assign 1.0 (all equally relevant)
            r["normalized_score"] = 1.0
        else:
            normalized = (r["score"] - min_score) / score_range
            r["normalized_score"] = (1.0 - normalized) if invert else normalized

    return results


def _deduplicate_by_text(results: List[Dict]) -> List[Dict]:
    """
    Remove duplicate chunks, keeping the one with the highest combined_score.

    WHY DEDUPLICATION?
    ───────────────────
    The same chunk may appear in BOTH vector search and BM25 search
    results. Without deduplication, the LLM would see the same text
    twice, wasting context window tokens.

    STRATEGY:
    ──────────
    We normalize whitespace and compare text content. If two results
    map to the same text, we keep the one with the higher combined_score.

    Args:
        results: List of merged results with "combined_score" field.

    Returns:
        Deduplicated list, sorted by combined_score (descending).
    """
    seen = {}
    for r in results:
        # Normalize whitespace for comparison
        key = " ".join(r["text"].split())
        if key not in seen or r["combined_score"] > seen[key]["combined_score"]:
            seen[key] = r

    deduplicated = sorted(seen.values(), key=lambda x: x["combined_score"], reverse=True)
    return deduplicated


def retrieve_hybrid(query: str, case_id: str = "default", top_k: int = TOP_K) -> List[Dict]:
    """
    Perform hybrid retrieval combining vector search and BM25 keyword search.

    HYBRID RETRIEVAL PIPELINE:
    ──────────────────────────
    ┌──────────────┐
    │  User Query   │
    └──────┬───────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
    ┌────────┐  ┌────────┐
    │ Vector │  │  BM25  │
    │ Search │  │ Search │
    │(Chroma)│  │(Okapi) │
    └───┬────┘  └───┬────┘
        │           │
        ▼           ▼
    ┌────────┐  ┌────────┐
    │Normalize│  │Normalize│
    │ Scores  │  │ Scores  │
    └───┬────┘  └───┬────┘
        │           │
        └─────┬─────┘
              │
              ▼
        ┌───────────┐
        │   Merge   │
        │ + Dedup   │
        │ + Weight  │
        └─────┬─────┘
              │
              ▼
        ┌──────────┐
        │ Top-K    │
        │ Results  │
        └──────────┘

    Args:
        query:   The user's question or search query.
        case_id: The forensic case to search within (isolation).
        top_k:   Number of final results to return.

    Returns:
        List of chunk dicts sorted by combined_score (descending).
        Each dict includes: text, score, combined_score, type, page, source,
        retrieval_method ("vector", "bm25", or "both").
    """
    # ── If hybrid is disabled, fall back to vector-only search ──
    if not USE_HYBRID_RETRIEVAL:
        print(f"[HYBRID] Hybrid retrieval DISABLED — using vector search only")
        results = vector_store.search(query, case_id=case_id, top_k=top_k)
        # Tag each result with retrieval method
        for r in results:
            r["retrieval_method"] = "vector"
            r["combined_score"] = r.get("score", 0)
        return results

    print(f"\n[HYBRID] ═══ Hybrid Retrieval Start ═══")
    print(f"[HYBRID] Query: '{query}' | Case: {case_id} | Top-K: {top_k}")
    print(f"[HYBRID] Weights: vector={VECTOR_WEIGHT}, bm25={BM25_WEIGHT}")

    # ══════════════════════════════════════════════════════
    # STEP 1: Vector Search via ChromaDB
    # ══════════════════════════════════════════════════════
    # This uses the existing vector_store.search() which includes:
    #   - HYDE (if enabled): hypothetical document embedding
    #   - Parent-Child (if enabled): parent text swapping
    #   - Source Diversity: ensures multi-source representation
    vector_results = vector_store.search(query, case_id=case_id, top_k=top_k)

    # ChromaDB returns L2 distances (lower = better), so invert=True
    vector_results = _normalize_scores(vector_results, invert=True)

    for r in vector_results:
        r["retrieval_method"] = "vector"

    print(f"[HYBRID] Vector search returned {len(vector_results)} results")

    # ══════════════════════════════════════════════════════
    # STEP 2: BM25 Keyword Search
    # ══════════════════════════════════════════════════════
    # BM25 searches by exact term overlap (tokenized).
    # It uses the same chunks indexed during ingestion.
    bm25_results = bm25_engine.search(query, case_id=case_id, top_k=top_k)

    # BM25 scores are higher = better, so invert=False
    bm25_results = _normalize_scores(bm25_results, invert=False)

    for r in bm25_results:
        r["retrieval_method"] = "bm25"

    print(f"[HYBRID] BM25 search returned {len(bm25_results)} results")

    # ══════════════════════════════════════════════════════
    # STEP 3: Compute combined scores
    # ══════════════════════════════════════════════════════
    # For vector results: combined = VECTOR_WEIGHT * norm_score + 0 (no BM25 score)
    # For BM25 results:   combined = 0 + BM25_WEIGHT * norm_score (no vector score)
    # For duplicates (same chunk in both): both weights apply → highest combined wins
    for r in vector_results:
        r["combined_score"] = VECTOR_WEIGHT * r.get("normalized_score", 0)

    for r in bm25_results:
        r["combined_score"] = BM25_WEIGHT * r.get("normalized_score", 0)

    # ══════════════════════════════════════════════════════
    # STEP 4: Merge results
    # ══════════════════════════════════════════════════════
    # Check for chunks that appear in BOTH result sets.
    # If a chunk is in both, combine their weighted scores:
    #   combined = VECTOR_WEIGHT * norm_vector + BM25_WEIGHT * norm_bm25
    bm25_by_text = {}
    for r in bm25_results:
        key = " ".join(r["text"].split())
        bm25_by_text[key] = r

    for r in vector_results:
        key = " ".join(r["text"].split())
        if key in bm25_by_text:
            # Chunk found in BOTH searches — combine scores
            bm25_match = bm25_by_text[key]
            r["combined_score"] = (
                VECTOR_WEIGHT * r.get("normalized_score", 0)
                + BM25_WEIGHT * bm25_match.get("normalized_score", 0)
            )
            r["retrieval_method"] = "both"
            # Remove from bm25 dict so it's not added again
            del bm25_by_text[key]

    # Remaining BM25-only results
    remaining_bm25 = list(bm25_by_text.values())

    # Merge all results
    merged = vector_results + remaining_bm25

    # ══════════════════════════════════════════════════════
    # STEP 5: Deduplicate and sort by combined score
    # ══════════════════════════════════════════════════════
    final = _deduplicate_by_text(merged)[:top_k]

    # ── Debug output ──
    both_count = sum(1 for r in final if r.get("retrieval_method") == "both")
    vector_only = sum(1 for r in final if r.get("retrieval_method") == "vector")
    bm25_only = sum(1 for r in final if r.get("retrieval_method") == "bm25")

    print(f"[HYBRID] Final: {len(final)} results "
          f"(vector-only: {vector_only}, bm25-only: {bm25_only}, both: {both_count})")
    for i, r in enumerate(final):
        print(f"  [{i+1}] combined={r['combined_score']:.4f} | "
              f"method={r['retrieval_method']} | type={r.get('type','?')} | "
              f"text={r['text'][:60]}...")
    print(f"[HYBRID] ═══ Hybrid Retrieval Complete ═══\n")

    return final
