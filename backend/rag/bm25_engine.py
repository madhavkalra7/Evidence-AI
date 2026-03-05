# ============================================================
# BM25 ENGINE — Keyword-based retrieval using BM25Okapi
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  THIS IS THE "KEYWORD SEARCH" HALF OF HYBRID RETRIEVAL. ║
# ║  It finds documents by EXACT TERM OVERLAP, not meaning. ║
# ╚══════════════════════════════════════════════════════════╝
#
# WHAT IS BM25?
# ──────────────
#   BM25 (Best Matching 25) is a probabilistic ranking function
#   used by search engines since the 1990s. It evolved from TF-IDF
#   with two key improvements:
#
#   1. SATURATION: Unlike raw TF (term frequency), BM25 applies
#      diminishing returns. The 5th occurrence of "knife" in a
#      document adds less score than the 1st. This prevents
#      keyword-stuffed documents from dominating results.
#
#   2. DOCUMENT LENGTH NORMALIZATION: Short documents with one
#      mention of "knife" score higher than long documents with
#      one mention, because the term is more significant in the
#      shorter document.
#
# BM25 FORMULA (SIMPLIFIED):
# ───────────────────────────
#   For each query term t in query Q, and document D:
#
#   score(D, Q) = Σ  IDF(t) * [ f(t,D) * (k1 + 1) ]
#                 t∈Q        ──────────────────────────────
#                              f(t,D) + k1 * (1 - b + b * |D|/avgdl)
#
#   Where:
#     - IDF(t)  = Inverse Document Frequency (how rare is the term?)
#     - f(t,D)  = Term frequency in document D
#     - |D|     = Length of document D
#     - avgdl   = Average document length in the corpus
#     - k1      = Term frequency saturation parameter (default: 1.5)
#     - b       = Length normalization parameter (default: 0.75)
#
# WHY BM25 ALONGSIDE VECTOR SEARCH?
# ───────────────────────────────────
#   Vector search (embeddings) captures SEMANTIC similarity:
#     "knife" matches "blade", "sharp weapon", "cutting instrument"
#
#   BM25 captures LEXICAL similarity (exact term overlap):
#     "GSR" matches "GSR" exactly, but NOT "gunshot residue"
#     "Case FR-2024-001" matches exactly, vectors might not
#
#   In forensic RAG, both matter:
#     - Investigators use specific jargon (BM25 strength)
#     - They also ask conceptual questions (vector strength)
#
#   EXAMPLE WHERE BM25 WINS:
#     Query: "What did the luminol test show?"
#     Vector search might return chunks about "chemical tests" in general.
#     BM25 finds the EXACT chunk mentioning "luminol" → more precise.
#
#   EXAMPLE WHERE VECTOR SEARCH WINS:
#     Query: "Was a murder weapon found?"
#     BM25 needs the word "weapon" to match.
#     Vector search matches "knife recovered from the scene" → semantic.
#
# IMPLEMENTATION:
# ────────────────
#   We use rank_bm25.BM25Okapi — a well-tested Python implementation.
#   The index is maintained IN-MEMORY per case (keyed by case_id).
#   When new chunks are added to ChromaDB, we mirror them here.
#   The index is rebuilt on every add (BM25Okapi is immutable).
# ============================================================

from rank_bm25 import BM25Okapi
from typing import List, Dict, Optional
import re


class BM25Engine:
    """
    In-memory BM25 keyword search engine with per-case index isolation.

    Architecture:
        ┌──────────────────────────────────────────────┐
        │              BM25Engine                       │
        │                                               │
        │  _case_corpora["case_FR-001"] = [             │
        │    { "text": "...", "tokens": [...], meta }   │
        │    { "text": "...", "tokens": [...], meta }   │
        │  ]                                            │
        │                                               │
        │  _case_indices["case_FR-001"] = BM25Okapi(…)  │
        └──────────────────────────────────────────────┘

    KEY DIFFERENCE FROM CHROMADB:
    ─────────────────────────────
    ChromaDB stores VECTORS (dense, 384-dim float arrays).
    BM25 stores TOKEN LISTS (sparse, variable-length string arrays).
    They search in fundamentally different ways — that's why
    combining them (hybrid retrieval) improves recall.
    """

    def __init__(self):
        """
        Initialize the BM25 engine.

        We maintain two dictionaries keyed by case_id:
          _case_corpora: Raw documents + metadata for each case
          _case_indices: Compiled BM25Okapi index for each case

        This mirrors ChromaDB's per-case collection architecture
        to ensure case isolation in keyword search as well.
        """
        # case_id → list of {"text": str, "tokens": List[str], "type": str, "page": int, ...}
        self._case_corpora: Dict[str, List[Dict]] = {}
        # case_id → BM25Okapi instance (rebuilt on every add)
        self._case_indices: Dict[str, BM25Okapi] = {}

        print("[BM25 ENGINE] Initialized (in-memory per-case keyword index)")

    def _tokenize(self, text: str) -> List[str]:
        """
        Tokenize text into lowercase words for BM25 indexing.

        TOKENIZATION STRATEGY:
        ──────────────────────
        We use a simple regex-based whitespace + punctuation split.
        This is intentional — BM25 works on exact term matching,
        so we want clean lowercase tokens without stemming.

        WHY NOT USE NLTK/SPACY TOKENIZER?
        ───────────────────────────────────
        For forensic documents, we WANT to keep:
          - Case IDs: "FR-2024-001" → ["fr-2024-001"]
          - Chemical names: "luminol" → ["luminol"]
          - Technical terms: "GSR" → ["gsr"]

        Stemming (e.g., "running" → "run") would lose precision
        for exact forensic terminology. BM25's strength IS exact matching.

        Args:
            text: Raw text string to tokenize.

        Returns:
            List of lowercase word tokens.
        """
        # Split on non-alphanumeric characters (keep hyphens for case IDs)
        tokens = re.findall(r'[a-zA-Z0-9][\w\-]*', text.lower())
        return tokens

    def add_documents(self, chunks: List[Dict], case_id: str = "default") -> int:
        """
        Add document chunks to the BM25 index for a specific case.

        This method is called ALONGSIDE vector_store.add_documents()
        during ingestion. Both indices receive the same chunks.

        IMPORTANT: BM25Okapi is immutable once created. We can't
        append to an existing index. So on every add, we:
          1. Append new chunks to the corpus list
          2. Rebuild the entire BM25 index from scratch

        This is acceptable because:
          - Typical case has 50-500 chunks (rebuilds in <10ms)
          - Adds happen during upload, not during queries
          - The index is purely in-memory, no disk I/O

        Args:
            chunks: List of chunk dicts with at least {"text": str}.
            case_id: Case identifier for isolation.

        Returns:
            Number of chunks added to the BM25 index.
        """
        if not chunks:
            return 0

        # Ensure corpus list exists for this case
        if case_id not in self._case_corpora:
            self._case_corpora[case_id] = []

        # Add each chunk with its tokenized form and metadata
        for chunk in chunks:
            text = chunk.get("text", "")
            tokens = self._tokenize(text)

            self._case_corpora[case_id].append({
                "text": text,
                "tokens": tokens,
                "type": chunk.get("type", "unknown"),
                "page": chunk.get("page", 0),
                "source": chunk.get("source", "unknown"),
                "case_id": case_id,
                "parent_text": chunk.get("parent_text", ""),
            })

        # Rebuild BM25 index for this case (immutable — must rebuild)
        self._build_index(case_id)

        print(f"[BM25 ENGINE] Added {len(chunks)} chunks to case '{case_id}'. "
              f"Total in case: {len(self._case_corpora[case_id])}")

        return len(chunks)

    def _build_index(self, case_id: str):
        """
        Rebuild the BM25Okapi index for a specific case.

        BM25Okapi takes a list of tokenized documents (list of lists)
        and precomputes IDF scores, average document length, etc.

        This is called after every add_documents() call.
        For typical forensic cases (50-500 chunks), this takes <10ms.

        Args:
            case_id: The case whose index to rebuild.
        """
        corpus = self._case_corpora.get(case_id, [])

        if not corpus:
            return

        # Extract just the token lists for BM25
        tokenized_corpus = [doc["tokens"] for doc in corpus]

        # Create new BM25Okapi instance
        # Parameters:
        #   k1 = 1.5 (term frequency saturation — default, works well)
        #   b  = 0.75 (document length normalization — default)
        self._case_indices[case_id] = BM25Okapi(tokenized_corpus)

        print(f"[BM25 ENGINE] Index rebuilt for case '{case_id}' "
              f"({len(corpus)} documents)")

    def search(self, query: str, case_id: str = "default", top_k: int = 5) -> List[Dict]:
        """
        Search for relevant chunks using BM25 keyword matching.

        BM25 SEARCH FLOW:
        ──────────────────
        1. Tokenize the query (same tokenizer as indexing)
        2. BM25Okapi.get_scores() returns a score for EVERY document
        3. Sort by score (descending) and take top_k
        4. Return chunks with their BM25 scores

        SCORING INTERPRETATION:
        ────────────────────────
        BM25 scores are NOT bounded to [0, 1]. They can be any
        non-negative float. Higher = more relevant.
        Normalization to [0, 1] happens later in hybrid_retriever.py.

        Args:
            query:   The user's search query.
            case_id: Which case to search within (case isolation).
            top_k:   Maximum number of results to return.

        Returns:
            List of dicts with "text", "score", "type", "page", etc.
            Sorted by BM25 score (highest first).
        """
        corpus = self._case_corpora.get(case_id, [])
        index = self._case_indices.get(case_id)

        if not corpus or index is None:
            print(f"[BM25 ENGINE] No index for case '{case_id}' — returning empty")
            return []

        # Tokenize the query using the same tokenizer
        query_tokens = self._tokenize(query)

        if not query_tokens:
            print(f"[BM25 ENGINE] Query produced no tokens — returning empty")
            return []

        # Get BM25 scores for ALL documents in the case
        scores = index.get_scores(query_tokens)

        # Pair scores with document indices and sort descending
        scored_docs = sorted(
            enumerate(scores),
            key=lambda x: x[1],
            reverse=True
        )

        # Take top_k results
        results = []
        for idx, score in scored_docs[:top_k]:
            doc = corpus[idx]
            results.append({
                "text": doc["text"],
                "score": float(score),
                "type": doc.get("type", "unknown"),
                "page": doc.get("page", 0),
                "source": doc.get("source", "unknown"),
                "case_id": doc.get("case_id", case_id),
                "parent_text": doc.get("parent_text", ""),
            })

        print(f"[BM25 ENGINE] Query: '{query}' (case: {case_id}) → "
              f"Top {len(results)} results (max score: {results[0]['score']:.4f})"
              if results else
              f"[BM25 ENGINE] Query: '{query}' (case: {case_id}) → 0 results")

        return results

    def clear(self, case_id: Optional[str] = None):
        """
        Clear BM25 index data.

        If case_id is provided: clear only that case's index.
        If case_id is None: clear ALL case indices (full reset).

        This should be called alongside vector_store.clear()
        to keep both indices synchronized.

        Args:
            case_id: Specific case to clear, or None for all.
        """
        if case_id:
            self._case_corpora.pop(case_id, None)
            self._case_indices.pop(case_id, None)
            print(f"[BM25 ENGINE] Cleared index for case '{case_id}'")
        else:
            self._case_corpora.clear()
            self._case_indices.clear()
            print(f"[BM25 ENGINE] Cleared ALL indices")

    def get_document_count(self, case_id: str = "default") -> int:
        """
        Get the number of documents in a case's BM25 index.

        Args:
            case_id: The case to check.

        Returns:
            Number of indexed documents for that case.
        """
        return len(self._case_corpora.get(case_id, []))


# ── Global singleton instance ──
# Mirrors the vector_store singleton pattern.
# Both indices are accessed globally and stay synchronized.
bm25_engine = BM25Engine()
