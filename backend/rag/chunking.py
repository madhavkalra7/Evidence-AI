# ============================================================
# CHUNKING ENGINE — Splits large text into smaller pieces
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  THIS IS ONE OF THE MOST CRITICAL PARTS OF RAG.        ║
# ║  Bad chunking = bad retrieval = bad answers.            ║
# ╚══════════════════════════════════════════════════════════╝
#
# WHY DO WE NEED CHUNKING?
# ─────────────────────────
# Problem 1: LLMs have a maximum context window (e.g., 8192 tokens).
#   A 50-page PDF has ~25,000 tokens. It won't fit.
#
# Problem 2: Embeddings work best on focused text.
#   If you embed an entire document, the vector becomes a
#   blurry average of ALL topics. It won't match any specific query.
#
# Problem 3: Retrieval precision.
#   If your "document" is the entire PDF, retrieval always returns
#   the entire PDF. That's useless. We need GRANULAR chunks so
#   retrieval can find the EXACT relevant paragraph.
#
# HOW CHUNKING WORKS:
# ────────────────────
#   Original text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" (26 chars)
#   Chunk size: 10, Overlap: 3
#
#   Chunk 1: "ABCDEFGHIJ"      (chars 0-9)
#   Chunk 2: "HIJKLMNOPQ"      (chars 7-16)  ← overlaps "HIJ"
#   Chunk 3: "OPQRSTUVWX"      (chars 14-23) ← overlaps "OPQ"
#   Chunk 4: "VWXYZ"           (chars 21-25) ← overlaps "VWX"
#
#   The overlap ensures no sentence gets cut in half.
#
# CHUNKING STRATEGIES:
# ─────────────────────
#   1. Fixed-size chunking (what we use here) — simple, reliable
#   2. Sentence-based chunking — split at sentence boundaries
#   3. Semantic chunking — use embeddings to find topic boundaries
#   4. Recursive chunking — try paragraphs first, then sentences
#
#   For a college project, fixed-size with overlap is perfect.
# ============================================================

from typing import List, Dict
from config import CHUNK_SIZE, CHUNK_OVERLAP


def chunk_text(text: str, source: str, source_type: str,
               page: int = 0, chunk_size: int = CHUNK_SIZE,
               overlap: int = CHUNK_OVERLAP) -> List[Dict]:
    """
    Split a text string into overlapping chunks with metadata.

    Args:
        text:        The raw text to chunk.
        source:      Where this text came from (filename).
        source_type: "pdf", "scene_image", or "evidence_image".
        page:        Page number (for PDFs).
        chunk_size:  Maximum characters per chunk.
        overlap:     Characters shared between consecutive chunks.

    Returns:
        List of chunk dictionaries with:
          - "text": The chunk content
          - "source": Origin file
          - "type": Source type
          - "page": Page number
          - "chunk_id": Sequential chunk identifier

    UNDERSTANDING THE CODE:
        We slide a window of size `chunk_size` across the text.
        After each chunk, we move the window forward by
        (chunk_size - overlap) characters.
        This creates overlapping windows that preserve context.
    """
    chunks = []
    start = 0
    chunk_id = 0

    while start < len(text):
        end = start + chunk_size
        chunk_content = text[start:end].strip()

        if chunk_content:  # Don't add empty chunks
            chunks.append({
                "text": chunk_content,
                "source": source,
                "type": source_type,
                "page": page,
                "chunk_id": chunk_id
            })
            chunk_id += 1

        # Move window forward. Subtract overlap to create shared region.
        # If overlap = 0, chunks are non-overlapping.
        start += chunk_size - overlap

    return chunks


def chunk_documents(documents: List[Dict]) -> List[Dict]:
    """
    Process a list of document dictionaries (from PDF loader or image captioner)
    and return a flat list of chunks.

    This is the main function called by the pipeline.

    Flow:
        [Page 1 text, Page 2 text, ...] → [Chunk 1, Chunk 2, Chunk 3, ...]
    """
    all_chunks = []

    for doc in documents:
        doc_chunks = chunk_text(
            text=doc["text"],
            source=doc.get("source", "unknown"),
            source_type=doc.get("type", "unknown"),
            page=doc.get("page", 0)
        )
        all_chunks.extend(doc_chunks)

    return all_chunks
