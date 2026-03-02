# ============================================================
# CONFIG — Forensic Multimodal RAG Assistant
# ============================================================
# This file loads environment variables and defines global
# configuration constants used across the RAG pipeline.
#
# WHY CONFIG IS SEPARATE:
#   In production systems, we never hard-code API keys.
#   We use environment variables loaded from a .env file.
#   This keeps secrets out of version control (git).
# ============================================================

import os
from dotenv import load_dotenv

# Load .env file into os.environ
load_dotenv()

# --- API Keys ---
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
HF_TOKEN: str = os.getenv("HF_TOKEN", "")

# --- Model Configuration ---
# Groq provides ultra-fast inference for open-source LLMs.
# We use Meta's Llama-3 8B model through Groq's API.
GROQ_MODEL: str = "llama-3.3-70b-versatile"

# HuggingFace embedding model — converts text into 384-dimensional vectors.
# "all-MiniLM-L6-v2" is lightweight, fast, and accurate for semantic search.
EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"

# Vision model — Groq's Llama 4 Scout analyzes images via API (no local download needed).
# This is the "multimodal" part. Images become text → then go through RAG like any other text.
GROQ_VISION_MODEL: str = "meta-llama/llama-4-scout-17b-16e-instruct"

# --- RAG Configuration ---
# CHUNK_SIZE: How many characters per text chunk.
#   WHY CHUNKING? LLMs have limited context windows. A 50-page PDF can't fit.
#   We split text into small overlapping pieces so we can:
#     1) Create meaningful embeddings for each piece
#     2) Retrieve only the RELEVANT pieces for a question
#     3) Stay within the LLM's token limit
CHUNK_SIZE: int = 500

# CHUNK_OVERLAP: Characters shared between consecutive chunks.
#   WHY OVERLAP? Without overlap, a sentence at the boundary of two chunks
#   gets split in half. Overlap ensures continuity and context preservation.
CHUNK_OVERLAP: int = 50

# TOP_K: Number of most-similar chunks to retrieve per query.
#   WHY TOP-K? More chunks = more context = better answers.
#   But too many = noise + token overflow. 5-10 is the sweet spot.
#   With source-diversity retrieval, having 8 ensures at least
#   2 chunks from each source type (PDF + image) are included.
TOP_K: int = 8

# --- ChromaDB Configuration ---
# ChromaDB is our vector database with native collection isolation.
# Each forensic case gets its own collection for evidence isolation.
# VECTOR_DIMENSION must match the embedding model's output dimension.
VECTOR_DIMENSION: int = 384  # all-MiniLM-L6-v2 outputs 384-dim vectors

# ============================================================
# ADVANCED FEATURE FLAGS
# ============================================================
# These flags enable/disable four research-level RAG enhancements.
# Each feature is fully modular — toggling one flag does NOT
# affect the others. When disabled, the system behaves exactly
# as before (standard flat RAG).
#
# Set to False to disable any feature without removing code.
# ============================================================

# --- HYDE (Hypothetical Document Embeddings) ---
# When True: User question → LLM generates hypothetical answer →
#   Embed hypothetical answer → Use THAT embedding for FAISS search.
# When False: Standard behavior — embed user question directly.
# Effect: Improves recall by 10-30% by bridging query-document semantic gap.
# Cost: One extra LLM API call per query (~0.5s latency).
USE_HYDE: bool = True

# --- Jailbreak Guard (XML-Based Prompt Injection Defense) ---
# When True: User input is scanned for injection patterns AND
#   prompts are wrapped in XML tags with strict hierarchy.
# When False: Standard prompting without injection defense.
# Effect: Prevents prompt injection, instruction override, evidence tampering requests.
# Cost: <1ms regex check + slightly longer prompts.
ENABLE_JAILBREAK_GUARD: bool = True

# --- Parent-Child Retrieval (Hierarchical Chunking) ---
# When True: PDF pages are stored as parents with child chunks.
#   FAISS searches child embeddings but returns parent text to LLM.
# When False: Standard flat chunking — each 500-char chunk is independent.
# Effect: LLM gets full page context, not just a 500-char fragment.
# Cost: ~2x metadata storage (parent text stored per child).
ENABLE_PARENT_CHILD: bool = True

# --- RAG Evaluation Logging ---
# When True: Every /api/chat response is evaluated for:
#   retrieval_relevance, grounding_score, answer_length, etc.
#   Logs are saved to backend/evaluation_logs.json.
# When False: No evaluation metrics computed or logged.
# Effect: Enables quality monitoring and regression detection.
# Cost: ~5ms per query for metrics computation.
ENABLE_EVALUATION: bool = True

# --- Case Supervisor (Auto-Linking & Isolation) ---
# When True: Uploads are automatically analyzed and linked to existing
#   cases using semantic similarity. If no matching case is found,
#   a new case is created. All queries are isolated to the active case.
# When False: All uploads go to a "default" case (no isolation).
# Effect: Prevents cross-incident contamination in multi-case workflows.
# Cost: One extra Groq LLM call per upload (~0.5s) for content summarization.
ENABLE_AUTO_CASE_LINKING: bool = True

# CASE_SIMILARITY_THRESHOLD: How similar content must be to auto-link
#   to an existing case (0.0 = always link, 1.0 = never link).
#   0.80 = 80% cosine similarity required to match an existing case.
#   Below this threshold, a NEW case is created.
CASE_SIMILARITY_THRESHOLD: float = 0.80

# --- Timeline Reconstruction ---
# When True: Enables the /api/timeline endpoint which extracts
#   time mentions from case evidence using regex + LLM enrichment,
#   reconstructs a chronological event timeline, and identifies
#   gaps and contradictions in the time sequence.
# When False: Timeline endpoint returns a disabled message.
# Effect: Provides investigators with a sorted event sequence.
# Cost: One Groq LLM call per timeline request (~1-2s).
ENABLE_TIMELINE: bool = True

# --- AI Hypothesis Generator ---
# When True: Enables the /api/hypothesis endpoint which uses
#   ACH (Analysis of Competing Hypotheses) methodology to
#   generate 3-5 investigative theories, rate each by evidence
#   strength, and identify supporting/contradicting evidence.
# When False: Hypothesis endpoint returns a disabled message.
# Effect: Combats confirmation bias by generating multiple theories.
# Cost: One Groq LLM call per hypothesis request (~1-2s).
ENABLE_HYPOTHESIS: bool = True

# --- Memory Across Sessions (Cross-Case Comparison) ---
# When True: Enables /api/memory endpoints for storing case
#   summaries persistently and comparing cases across sessions.
#   Users can ask "Compare this case with the previous one".
# When False: Memory endpoints return a disabled message.
# Effect: Enables pattern detection and cross-case learning.
# Cost: One Groq LLM call per summary/comparison (~1-2s).
ENABLE_CASE_MEMORY: bool = True

# --- Paths ---
UPLOAD_DIR: str = os.path.join(os.path.dirname(__file__), "uploads")
CHROMA_PERSIST_DIR: str = os.path.join(os.path.dirname(__file__), "chroma_store")

# Create directories if they don't exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
