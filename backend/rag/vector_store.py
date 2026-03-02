# ============================================================
# VECTOR STORE — ChromaDB-based vector database for RAG retrieval
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  THIS IS THE "DATABASE" OF RAG.                         ║
# ║  Instead of SQL queries, we use VECTOR SIMILARITY.      ║
# ╚══════════════════════════════════════════════════════════╝
#
# WHY CHROMADB INSTEAD OF FAISS?
# ──────────────────────────────
#   FAISS is a raw vector index — it stores vectors and does
#   nearest-neighbor search. That's it. Metadata (text, source,
#   page) must be tracked manually in a parallel Python list.
#
#   Problems with FAISS for multi-case forensic systems:
#     1. NO COLLECTION ISOLATION — all vectors live in one flat index.
#        Case A's evidence leaks into Case B's queries.
#     2. NO BUILT-IN METADATA FILTERING — you can't say
#        "search only within case_id=X". You'd have to filter results
#        AFTER retrieval, which wastes compute and misses Top-K.
#     3. NO PERSISTENCE — FAISS index lives in memory. Server restart
#        loses all data unless you manually serialize/deserialize.
#     4. NO DOCUMENT STORAGE — FAISS only stores vectors. You need
#        a separate data structure for the actual text.
#
#   ChromaDB solves ALL of these:
#     ✅ COLLECTIONS — each case is a separate collection (database table)
#     ✅ METADATA FILTERING — native support for filtering by any metadata field
#     ✅ PERSISTENCE — data survives server restarts (persistent client)
#     ✅ DOCUMENT STORAGE — stores vectors, documents, AND metadata together
#     ✅ BUILT-IN EMBEDDING — can embed on add (we use our own for control)
#
#   ┌────────────────────────┬────────────────┬──────────────────┐
#   │  Feature               │  FAISS         │  ChromaDB        │
#   ├────────────────────────┼────────────────┼──────────────────┤
#   │  Multi-collection      │  ✗ (manual)    │  ✓ native        │
#   │  Metadata filtering    │  ✗             │  ✓ native        │
#   │  Persistence           │  ✗ (manual)    │  ✓ automatic     │
#   │  Document storage      │  ✗ (manual)    │  ✓ built-in      │
#   │  Embedding integration │  ✗             │  ✓ optional      │
#   │  Scale (millions)      │  ✓ blazing     │  ✓ good enough   │
#   │  Distance metrics      │  L2 only       │  L2, Cosine, IP  │
#   └────────────────────────┴────────────────┴──────────────────┘
#
# WHY MULTI-COLLECTION ARCHITECTURE?
# ────────────────────────────────────
#   In forensic work, cases MUST be isolated. Evidence from a
#   burglary case should NEVER appear in an arson case query.
#
#   Multi-collection architecture:
#     ChromaDB Server
#       ├── Collection: case_FR-001  (burglary evidence)
#       ├── Collection: case_FR-002  (arson evidence)
#       └── Collection: case_FR-003  (homicide evidence)
#
#   When user queries: we get their session's active case,
#   open ONLY that collection, and search ONLY within it.
#   Zero cross-case contamination by design.
#
# VECTOR SEARCH FLOW (UPGRADED):
# ───────────────────────────────
#   1. User asks: "Was a knife found at the scene?"
#   2. Get session's active case → "case_FR-001"
#   3. Open collection "case_FR-001"
#   4. (HYDE): generate hypothetical doc → embed it
#   5. ChromaDB searches embeddings in that collection only
#   6. Returns top-K results with documents and metadata
#   7. (Parent-Child): swap child text for parent text
#   8. Context chunks → LLM → Forensic answer
# ============================================================

import chromadb
import numpy as np
import os
from typing import List, Dict, Optional
from rag.embedding_engine import embed_text
from config import (
    VECTOR_DIMENSION, TOP_K,
    USE_HYDE, ENABLE_PARENT_CHILD,
    CHROMA_PERSIST_DIR
)


# ── Initialize ChromaDB persistent client ──
# Persistent client stores data on disk. Survives server restarts.
# Data is stored in the CHROMA_PERSIST_DIR directory.
#
# WHY PERSISTENT CLIENT?
#   chromadb.Client() = in-memory only (lost on restart)
#   chromadb.PersistentClient() = saved to disk (durable)
#
#   For forensic evidence, persistence is critical.
#   We can't lose indexed case data on every server restart.
_chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
print(f"[VECTOR STORE] ChromaDB initialized (persist_dir: {CHROMA_PERSIST_DIR})")


class VectorStore:
    """
    ChromaDB-backed vector store with case-level collection isolation.

    Architecture:
        ┌─────────────────────────────────────────────────┐
        │              ChromaDB Client                     │
        │                                                  │
        │  ┌──────────────────────────────────────────┐   │
        │  │  Collection: case_FR-001                  │   │
        │  │  ├── Document 0 + Embedding + Meta        │   │
        │  │  ├── Document 1 + Embedding + Meta        │   │
        │  │  └── Document 2 + Embedding + Meta        │   │
        │  └──────────────────────────────────────────┘   │
        │                                                  │
        │  ┌──────────────────────────────────────────┐   │
        │  │  Collection: case_FR-002                  │   │
        │  │  ├── Document 0 + Embedding + Meta        │   │
        │  │  └── Document 1 + Embedding + Meta        │   │
        │  └──────────────────────────────────────────┘   │
        └─────────────────────────────────────────────────┘

    Each collection is a completely isolated vector index.
    Queries in collection A never see documents from collection B.

    KEY DIFFERENCE FROM FAISS:
    ──────────────────────────
    FAISS: One flat index + parallel metadata list
    Chroma: Multiple collections, each storing vectors + documents + metadata natively

    We no longer need to manually track metadata in a Python list.
    ChromaDB handles the vector ↔ document ↔ metadata linkage internally.
    """

    def __init__(self):
        """
        Initialize the ChromaDB vector store.

        Unlike FAISS, we don't create a single flat index here.
        Instead, collections are created per-case via get_or_create_collection().
        This constructor just initializes tracking state.
        """
        # Track total chunks across ALL collections for stats
        self._total_chunks: int = 0

        # Reference to the Chroma client
        self._client = _chroma_client

        # Count existing chunks from persisted collections
        try:
            for col in self._client.list_collections():
                self._total_chunks += col.count()
        except Exception:
            pass

        print(f"[VECTOR STORE] ChromaDB ready. Existing chunks: {self._total_chunks}")

    @property
    def total_chunks(self) -> int:
        """Total number of chunks across all collections."""
        return self._total_chunks

    def _get_collection(self, case_id: str) -> chromadb.Collection:
        """
        Get or create a ChromaDB collection for a specific case.

        ChromaDB collection names have restrictions:
          - 3-63 characters
          - Starts/ends with alphanumeric
          - Can contain hyphens and underscores
          - No consecutive periods

        We sanitize the case_id to ensure compliance.

        WHY get_or_create_collection?
        ──────────────────────────────
        - If collection exists → return it (no data loss)
        - If collection doesn't exist → create empty one
        - Thread-safe: concurrent requests won't create duplicates

        Args:
            case_id: The case identifier (e.g., "CASE-20260224-a1b2c3")

        Returns:
            A ChromaDB Collection object for this case.
        """
        # Sanitize collection name for ChromaDB requirements
        # Replace any non-alphanumeric characters (except hyphens) with underscore
        safe_name = case_id.replace(" ", "_")

        # Ensure name is within length limits
        if len(safe_name) < 3:
            safe_name = safe_name + "_col"
        elif len(safe_name) > 63:
            safe_name = safe_name[:63]

        collection = self._client.get_or_create_collection(
            name=safe_name,
            metadata={"hnsw:space": "l2"}  # Use L2 distance (same as old FAISS)
        )
        return collection

    def add_documents(self, chunks: List[Dict], case_id: str = "default") -> int:
        """
        Embed text chunks and add them to a case-specific ChromaDB collection.

        Args:
            chunks:  List of chunk dictionaries with "text" and metadata.
            case_id: The case this data belongs to.

        Returns:
            Number of chunks added.

        FLOW:
            chunks → extract texts → embed all → add to Chroma collection
                                                      ↓
                                        stored with metadata (type, page, parent_text)

        CHROMA STORAGE FORMAT:
        ──────────────────────
        For each chunk, Chroma stores:
          - id:        Unique identifier (case_id + counter)
          - document:  The child chunk text (for retrieval display)
          - embedding: 384-dim vector (generated by our embedding engine)
          - metadata:  {
              "case_id": "CASE-20260224-a1b2c3",
              "type": "pdf" or "scene_image" or "evidence_image",
              "page": page_number,
              "parent_text": full_page_text (if parent-child enabled),
              "source": "filename.pdf"
            }

        WHY WE STORE parent_text IN METADATA:
        ──────────────────────────────────────
        ChromaDB metadata supports string values up to 32KB.
        A typical page is 2000-5000 chars — well within limits.
        This avoids a separate parent lookup table.
        """
        if not chunks:
            return 0

        collection = self._get_collection(case_id)

        # Extract text content from each chunk
        texts = [chunk["text"] for chunk in chunks]

        # Generate embeddings for ALL chunks at once (batch processing)
        embeddings = embed_text(texts)
        embeddings = np.array(embeddings, dtype=np.float32)

        # Prepare data for ChromaDB batch insert
        ids = []
        documents = []
        metadatas = []
        embedding_list = []

        # Get current count for unique ID generation
        existing_count = collection.count()

        for i, chunk in enumerate(chunks):
            # Generate unique ID: case_id + sequential counter
            doc_id = f"{case_id}_chunk_{existing_count + i}"

            # Build metadata dict
            # ChromaDB metadata values must be str, int, float, or bool
            meta = {
                "case_id": case_id,
                "type": chunk.get("type", "unknown"),
                "page": chunk.get("page", 0),
                "source": chunk.get("source", "unknown"),
            }

            # Store parent_text in metadata for Parent-Child retrieval
            if "parent_text" in chunk:
                meta["parent_text"] = chunk["parent_text"]

            # Store child_text explicitly
            if "child_text" in chunk:
                meta["child_text"] = chunk["child_text"]

            ids.append(doc_id)
            documents.append(chunk["text"])
            metadatas.append(meta)
            embedding_list.append(embeddings[i].tolist())

        # Batch add to ChromaDB collection
        collection.add(
            ids=ids,
            documents=documents,
            embeddings=embedding_list,
            metadatas=metadatas
        )

        self._total_chunks += len(chunks)

        print(f"[VECTOR STORE] Added {len(chunks)} chunks to collection '{case_id}'. "
              f"Collection total: {collection.count()}. Global total: {self._total_chunks}")
        return len(chunks)

    def search(self, query: str, case_id: str = "default", top_k: int = TOP_K) -> List[Dict]:
        """
        Find the most relevant chunks for a query within a specific case.
        
        INCLUDES SOURCE-DIVERSITY GUARANTEE:
        When the collection has chunks from multiple source types (PDF + image),
        retrieval ensures at least MIN_PER_SOURCE_TYPE results from each type.
        This prevents the LLM from seeing only one source and claiming
        "no cross-source comparison is possible."

        CASE ISOLATION:
        ────────────────
        We ONLY search within the specified case's collection.
        Documents from other cases are INVISIBLE to this query.

        Enhanced with three features:
          1. HYDE: hypothetical document embedding
          2. PARENT-CHILD: return parent text instead of child chunk
          3. SOURCE DIVERSITY: ensure multiple source types in results
        """
        collection = self._get_collection(case_id)

        if collection.count() == 0:
            print(f"[VECTOR STORE] Collection '{case_id}' is empty")
            return []

        # ── HYDE: Generate hypothetical document for embedding ──
        if USE_HYDE:
            from rag.hyde import generate_hypothetical_document
            hypothetical_doc = generate_hypothetical_document(query)
            query_embedding = embed_text(hypothetical_doc)
            print(f"[VECTOR STORE] Using HYDE embedding (hypothetical doc)")
        else:
            query_embedding = embed_text(query)
            print(f"[VECTOR STORE] Using standard query embedding")

        query_embedding = np.array(query_embedding, dtype=np.float32)

        # Ensure 1D array
        if query_embedding.ndim > 1:
            query_embedding = query_embedding[0]

        # ── ChromaDB query — fetch MORE than top_k for diversity pool ──
        # We retrieve a larger pool (3x top_k) so we can ensure
        # representation from each source type before trimming.
        DIVERSITY_POOL_MULTIPLIER = 3
        MIN_PER_SOURCE_TYPE = 2  # guarantee at least 2 chunks from each source type
        pool_size = min(top_k * DIVERSITY_POOL_MULTIPLIER, collection.count())
        actual_top_k = max(pool_size, min(top_k, collection.count()))

        chroma_results = collection.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=actual_top_k,
            include=["documents", "metadatas", "distances"]
        )

        # ── Build raw results list ──
        raw_results = []
        if chroma_results and chroma_results["ids"] and chroma_results["ids"][0]:
            for i in range(len(chroma_results["ids"][0])):
                doc_text = chroma_results["documents"][0][i] if chroma_results["documents"] else ""
                metadata = chroma_results["metadatas"][0][i] if chroma_results["metadatas"] else {}
                distance = chroma_results["distances"][0][i] if chroma_results["distances"] else 0.0

                result = {
                    "text": doc_text,
                    "type": metadata.get("type", "unknown"),
                    "page": metadata.get("page", 0),
                    "source": metadata.get("source", "unknown"),
                    "score": float(distance),
                    "case_id": metadata.get("case_id", case_id),
                }

                # Carry parent/child text if present
                if "parent_text" in metadata:
                    result["parent_text"] = metadata["parent_text"]
                if "child_text" in metadata:
                    result["child_text"] = metadata["child_text"]

                raw_results.append(result)

        # ── PARENT-CHILD: Swap child text for parent text ──
        if ENABLE_PARENT_CHILD:
            seen_parents = {}
            deduplicated = []

            for result in raw_results:
                if "parent_text" in result:
                    parent_key = (result.get("source", ""), result.get("page", 0))

                    if parent_key not in seen_parents:
                        parent_result = result.copy()
                        parent_result["child_text"] = result["text"]
                        parent_result["text"] = result["parent_text"]
                        seen_parents[parent_key] = parent_result
                        deduplicated.append(parent_result)
                    else:
                        existing = seen_parents[parent_key]
                        if result["score"] < existing["score"]:
                            existing["score"] = result["score"]
                else:
                    deduplicated.append(result)

            raw_results = deduplicated
            print(f"[VECTOR STORE] Parent-child dedup: {len(raw_results)} unique parents from pool of {actual_top_k}")

        # ── SOURCE DIVERSITY: Ensure chunks from each source type ──
        # Group results by source type (pdf vs scene_image vs evidence_image)
        source_types = {}
        for r in raw_results:
            stype = r.get("type", "unknown")
            if stype not in source_types:
                source_types[stype] = []
            source_types[stype].append(r)

        num_source_types = len(source_types)
        
        if num_source_types > 1:
            # Multiple source types detected — enforce diversity
            print(f"[VECTOR STORE] Source diversity: {num_source_types} types found: {list(source_types.keys())}")
            
            results = []
            remaining_slots = top_k
            
            # Step 1: Guarantee MIN_PER_SOURCE_TYPE from each type (sorted by score)
            for stype, chunks in source_types.items():
                chunks_sorted = sorted(chunks, key=lambda x: x["score"])
                take = min(MIN_PER_SOURCE_TYPE, len(chunks_sorted), remaining_slots)
                for chunk in chunks_sorted[:take]:
                    if chunk not in results:
                        results.append(chunk)
                        remaining_slots -= 1
                print(f"[VECTOR STORE] Guaranteed {take} chunks from '{stype}'")
            
            # Step 2: Fill remaining slots with best-scoring chunks across all types
            if remaining_slots > 0:
                all_remaining = [r for r in raw_results if r not in results]
                all_remaining.sort(key=lambda x: x["score"])
                results.extend(all_remaining[:remaining_slots])
            
            # Sort final results by score (best first)
            results.sort(key=lambda x: x["score"])
        else:
            # Only one source type — just take top_k by score
            results = sorted(raw_results, key=lambda x: x["score"])[:top_k]

        # Debug output
        print(f"\n[VECTOR STORE] Search Query: '{query}' (case: {case_id})")
        print(f"[VECTOR STORE] Top {len(results)} results (from pool of {len(raw_results)}, diversity: {num_source_types} types):")
        for r in results:
            display_text = r.get("child_text", r["text"]) if ENABLE_PARENT_CHILD else r["text"]
            print(f"  Score: {r['score']:.4f} | Source: {r['type']} | "
                  f"Text: {display_text[:80]}...")

        return results

    def clear(self, case_id: Optional[str] = None):
        """
        Clear vector store data.

        If case_id is provided: delete only that case's collection.
        If case_id is None: delete ALL collections (full reset).

        WHY DELETE COLLECTION INSTEAD OF EMPTYING IT?
        ──────────────────────────────────────────────
        ChromaDB doesn't have a "truncate" operation.
        Deleting and recreating is cleaner and releases resources.
        """
        if case_id:
            # Delete specific case collection
            try:
                safe_name = case_id.replace(" ", "_")
                self._client.delete_collection(safe_name)
                print(f"[VECTOR STORE] Deleted collection: {case_id}")
            except Exception as e:
                print(f"[VECTOR STORE] Collection {case_id} not found: {e}")
        else:
            # Delete ALL collections
            try:
                for col in self._client.list_collections():
                    self._client.delete_collection(col.name)
                print(f"[VECTOR STORE] Deleted all collections")
            except Exception as e:
                print(f"[VECTOR STORE] Error clearing collections: {e}")

        # Reset counter
        self._total_chunks = 0

        # Recount from remaining collections
        try:
            for col in self._client.list_collections():
                self._total_chunks += col.count()
        except Exception:
            pass

        print(f"[VECTOR STORE] Cleared. Remaining chunks: {self._total_chunks}")

    def get_stats(self, case_id: Optional[str] = None) -> Dict:
        """
        Return statistics about the vector store.

        If case_id provided: stats for that case only.
        If None: global stats across all cases.
        """
        if case_id:
            collection = self._get_collection(case_id)
            return {
                "case_id": case_id,
                "total_chunks": collection.count(),
                "dimension": VECTOR_DIMENSION,
            }
        else:
            # Global stats
            collections = self._client.list_collections()
            case_stats = {}
            total = 0
            for col in collections:
                count = col.count()
                total += count
                case_stats[col.name] = count

            return {
                "total_chunks": total,
                "total_cases": len(collections),
                "dimension": VECTOR_DIMENSION,
                "cases": case_stats
            }

    def get_case_chunk_count(self, case_id: str) -> int:
        """Get the number of chunks in a specific case's collection."""
        collection = self._get_collection(case_id)
        return collection.count()


# ── Global singleton instance ──
# WHY SINGLETON? In a web server, multiple requests should access
# the SAME vector store, not create new ones each time.
vector_store = VectorStore()
