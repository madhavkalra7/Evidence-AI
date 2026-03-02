# ============================================================
# PARENT-CHILD RETRIEVAL — Hierarchical Chunk Storage
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  THIS MODULE IMPLEMENTS HIERARCHICAL CHUNKING FOR RAG.  ║
# ║  It searches on FINE-GRAINED child chunks but returns   ║
# ║  COARSE-GRAINED parent context to the LLM.             ║
# ╚══════════════════════════════════════════════════════════╝
#
# ─────────────────────────────────────────────────────────
# THE PROBLEM WITH FLAT CHUNKING
# ─────────────────────────────────────────────────────────
#
#   Standard RAG uses FLAT chunks: every chunk is the same size
#   (e.g., 500 characters) and is treated equally.
#
#   Problem 1: CONTEXT FRAGMENTATION
#   ─────────────────────────────────
#     A 500-char chunk might say:
#       "The knife was found near the window."
#     
#     But the FULL context (from the page) also says:
#       "The knife was found near the window. However, the window
#        showed no signs of forced entry, and the knife's position
#        was inconsistent with the reported break-in direction.
#        The forensic team noted that the blood spatter pattern
#        suggested the knife had been placed post-incident."
#
#     With flat chunking, the LLM only sees the first sentence.
#     It MISSES the crucial context about staging.
#
#   Problem 2: EMBEDDING DILUTION
#   ──────────────────────────────
#     If you make chunks LARGER to capture more context:
#       - The embedding becomes a "blurry average" of many topics
#       - Retrieval precision drops (irrelevant text retrieved)
#
#     If you make chunks SMALLER for precise retrieval:
#       - Great precision, but the LLM sees too little context
#       - Answers lack depth and miss surrounding details
#
#     This is the PRECISION-CONTEXT TRADEOFF:
#       Small chunks = precise retrieval + narrow context
#       Large chunks = broad context + imprecise retrieval
#
# ─────────────────────────────────────────────────────────
# HOW PARENT-CHILD RETRIEVAL SOLVES THIS
# ─────────────────────────────────────────────────────────
#
#   We get the BEST OF BOTH WORLDS:
#
#   CHILD chunks (500 chars):
#     → Small, focused, precise embeddings
#     → Used for FAISS SEARCH (retrieval)
#     → High precision: finds the exact relevant passage
#
#   PARENT chunks (full page/section):
#     → Large, comprehensive context
#     → Sent to LLM for ANSWER GENERATION
#     → High coherence: LLM sees the full picture
#
#   FLOW:
#     Question → embed → search CHILD embeddings in FAISS
#                         ↓
#                    Find matching children
#                         ↓
#                    Look up their PARENT text
#                         ↓
#                    Send PARENT text to LLM
#
#   ANALOGY:
#   Think of a book's INDEX vs. its CHAPTERS.
#     - The INDEX has short, precise entries (like child chunks)
#       → "Knife evidence: page 47"
#     - But when you GO to page 47, you read the FULL CHAPTER
#       → That's the parent chunk
#     - The index helps you FIND it. The chapter helps you UNDERSTAND.
#
# ─────────────────────────────────────────────────────────
# WHY FINE-GRAINED EMBEDDINGS + COARSE CONTEXT WORKS
# ─────────────────────────────────────────────────────────
#
#   EMBEDDING QUALITY vs. CHUNK SIZE:
#   ─────────────────────────────────
#   Chunk Size  │ Embedding Quality │ Context Quality
#   ────────────│───────────────────│─────────────────
#   100 chars   │ ★★★★★ (precise)  │ ★☆☆☆☆ (too short)
#   500 chars   │ ★★★★☆ (good)     │ ★★★☆☆ (partial)
#   2000 chars  │ ★★☆☆☆ (diluted)  │ ★★★★★ (complete)
#   Full page   │ ★☆☆☆☆ (blurry)   │ ★★★★★ (complete)
#
#   Parent-child gives us:
#   Search with:  500 chars  → ★★★★☆ retrieval precision
#   Answer with:  Full page  → ★★★★★ context completeness
#
#   MATHEMATICAL INTUITION:
#   ───────────────────────
#   A 500-char chunk embedding captures a SPECIFIC semantic region.
#   Its embedding vector points precisely at ONE topic in 384D space.
#
#   A full-page embedding is an AVERAGE of many topics on that page.
#   Its vector points to the CENTER of a cluster — less specific.
#
#   By searching with child embeddings but returning parent text:
#     cos_sim(query, child_embedding) > cos_sim(query, page_embedding)
#     BUT the LLM gets the FULL page_text for rich understanding.
#
# ─────────────────────────────────────────────────────────
# DIFFERENCE: FLAT CHUNKING vs. HIERARCHICAL RETRIEVAL
# ─────────────────────────────────────────────────────────
#
#   FLAT CHUNKING (current system without parent-child):
#     PDF Page → [Chunk1, Chunk2, Chunk3, Chunk4]
#     Each chunk lives independently in FAISS
#     Search returns: Chunk2 text (500 chars)
#     LLM sees: 500 chars of context per result
#
#   HIERARCHICAL RETRIEVAL (this module):
#     PDF Page → Parent (full page text)
#                  ├── Child1 (500 chars) → embedded in FAISS
#                  ├── Child2 (500 chars) → embedded in FAISS
#                  ├── Child3 (500 chars) → embedded in FAISS
#                  └── Child4 (500 chars) → embedded in FAISS
#     Search FAISS → matches Child2
#     But returns: Parent (full page text, 2000+ chars)
#     LLM sees: Complete page with all surrounding context!
#
#   COMPARISON:
#   ┌─────────────────────┬──────────────┬─────────────────────┐
#   │  Metric             │  Flat        │  Parent-Child       │
#   ├─────────────────────┼──────────────┼─────────────────────┤
#   │  Retrieval Precision│  ★★★★☆      │  ★★★★☆ (same)       │
#   │  Context Richness   │  ★★★☆☆      │  ★★★★★ (much better)│
#   │  Answer Coherence   │  ★★★☆☆      │  ★★★★★              │
#   │  Storage Overhead   │  1x          │  ~2x (store parent) │
#   │  Retrieval Speed    │  Same        │  Same (FAISS on children) │
#   │  Implementation     │  Simple      │  Moderate           │
#   └─────────────────────┴──────────────┴─────────────────────┘
#
# ─────────────────────────────────────────────────────────
# STORAGE SCHEMA
# ─────────────────────────────────────────────────────────
#
#   Each metadata entry stored alongside FAISS vector:
#   {
#     "child_text":  "500-char chunk used for embedding",
#     "parent_text": "Full page/section text for LLM context",
#     "text":        "child_text" (for backward compatibility),
#     "page":        int (page number),
#     "type":        "pdf" | "scene_image" | "evidence_image",
#     "source":      "filename.pdf",
#     "chunk_id":    int
#   }
#
#   When the flag ENABLE_PARENT_CHILD is False:
#     parent_text == child_text (no difference)
#     System behaves exactly like flat chunking
# ============================================================

from typing import List, Dict
from config import CHUNK_SIZE, CHUNK_OVERLAP


def create_parent_child_chunks(
    text: str,
    source: str,
    source_type: str,
    page: int = 0,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP
) -> List[Dict]:
    """
    Create hierarchical parent-child chunks from a text document.

    The PARENT is the full text of the page/section.
    The CHILDREN are small overlapping chunks (500 chars each).
    
    FAISS will index the CHILD embeddings for precise retrieval.
    But when a child is retrieved, we return the PARENT text to the LLM
    for richer, more coherent context.

    Args:
        text:        The full text of a page/section (becomes the PARENT)
        source:      Origin filename (for metadata tracking)
        source_type: "pdf", "scene_image", or "evidence_image"
        page:        Page number for PDFs (0 for images)
        chunk_size:  Size of child chunks in characters
        overlap:     Character overlap between consecutive children

    Returns:
        List of chunk dictionaries, each containing:
          - "text": child_text (used for embedding, backward compatible)
          - "child_text": same as text (explicit reference)
          - "parent_text": full page/section text (sent to LLM at retrieval)
          - "source": origin filename
          - "type": source type
          - "page": page number
          - "chunk_id": sequential ID within this page

    FLOW VISUALIZATION:
    ────────────────────
    Input: Full page text (2000 chars)
        → parent_text = entire 2000 chars (stored in metadata)
        → child_1 = chars 0-499 (embedded in FAISS)
        → child_2 = chars 450-949 (embedded in FAISS)
        → child_3 = chars 900-1399 (embedded in FAISS)
        → child_4 = chars 1350-1849 (embedded in FAISS)
        → child_5 = chars 1800-2000 (embedded in FAISS)
    
    Each child points back to the SAME parent_text.
    So if child_3 is retrieved, the LLM gets all 2000 chars.

    WHY STORE parent_text IN EVERY CHILD'S METADATA?
    ──────────────────────────────────────────────────
    Alternative: Store a parent_id and look up parent from a separate table.
    We chose to duplicate for simplicity:
      - No need for a separate parent lookup table
      - FAISS metadata is a simple list — no joins needed
      - Storage cost is minimal (text is small vs. vectors)
      - Each result is self-contained (no second lookup needed)
    
    In production with millions of documents, a parent lookup
    table (keyed by page + source) would be more memory-efficient.
    """
    parent_text = text.strip()
    chunks = []
    start = 0
    chunk_id = 0

    while start < len(parent_text):
        end = start + chunk_size
        child_text = parent_text[start:end].strip()

        if child_text:
            chunks.append({
                # "text" = child text for backward compatibility
                # The embedding engine and FAISS see "text" and embed CHILD text
                "text": child_text,

                # Explicit parent-child fields for clarity
                "child_text": child_text,
                "parent_text": parent_text,

                # Standard metadata (unchanged from flat chunking)
                "source": source,
                "type": source_type,
                "page": page,
                "chunk_id": chunk_id
            })
            chunk_id += 1

        # Slide the window forward (same as flat chunking)
        start += chunk_size - overlap

    return chunks


def create_parent_child_documents(documents: List[Dict]) -> List[Dict]:
    """
    Process a list of document dictionaries using parent-child hierarchical chunking.

    This replaces chunk_documents() when ENABLE_PARENT_CHILD is True.
    Each page/document becomes a parent, and its child chunks are created for embedding.

    Args:
        documents: List of document dicts from PDF loader or image processor.
                  Each dict has: text, page, source, type

    Returns:
        Flat list of parent-child chunk dictionaries.
        Each chunk has both child_text (for FAISS) and parent_text (for LLM).

    FLOW:
    ──────
    [Page 1 text, Page 2 text, ...]
       │
       ▼
    Page 1 → parent = full page 1
              ├── child_1 (500 chars) with parent pointer
              ├── child_2 (500 chars) with parent pointer
              └── child_3 (500 chars) with parent pointer
    
    Page 2 → parent = full page 2
              ├── child_4 (500 chars) with parent pointer
              └── child_5 (500 chars) with parent pointer

    Result: [child_1, child_2, child_3, child_4, child_5]
            Each child carries its parent_text in metadata.

    IMPORTANT — Image documents:
    ─────────────────────────────
    For images (scene_image, evidence_image), the "document" text is
    the Groq Vision analysis (~2000 chars). This becomes the parent.
    Its child chunks enable precise retrieval of specific forensic
    details (e.g., "weapons" section) while the parent provides
    the complete visual analysis to the LLM.
    """
    all_chunks = []

    for doc in documents:
        doc_chunks = create_parent_child_chunks(
            text=doc["text"],
            source=doc.get("source", "unknown"),
            source_type=doc.get("type", "unknown"),
            page=doc.get("page", 0)
        )
        all_chunks.extend(doc_chunks)

    print(f"[PARENT-CHILD] Created {len(all_chunks)} child chunks "
          f"from {len(documents)} parent documents")

    # Log parent-child statistics
    parent_pages = set()
    for chunk in all_chunks:
        parent_pages.add((chunk.get("source", ""), chunk.get("page", 0)))

    print(f"[PARENT-CHILD] {len(parent_pages)} unique parents → "
          f"{len(all_chunks)} children")
    print(f"[PARENT-CHILD] Average children per parent: "
          f"{len(all_chunks) / max(len(parent_pages), 1):.1f}")

    return all_chunks
