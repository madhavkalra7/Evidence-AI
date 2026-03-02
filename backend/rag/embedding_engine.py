# ============================================================
# EMBEDDING ENGINE — Converts text into numerical vectors
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  EMBEDDINGS ARE THE HEART OF RAG.                       ║
# ║  Without embeddings, there is no semantic search.       ║
# ╚══════════════════════════════════════════════════════════╝
#
# WHAT IS AN EMBEDDING?
# ──────────────────────
#   An embedding is a numerical representation of text in a
#   high-dimensional vector space.
#
#   Example:
#     "crime scene"     → [0.12, -0.45, 0.78, 0.33, ...]  (384 numbers)
#     "murder location"  → [0.11, -0.43, 0.76, 0.35, ...]  (384 numbers)
#     "chocolate cake"   → [0.89, 0.22, -0.15, 0.67, ...]  (384 numbers)
#
#   Notice: "crime scene" and "murder location" have SIMILAR vectors
#   because they mean similar things. "chocolate cake" is very different.
#
#   This is the magic of embeddings:
#   SIMILAR MEANING → SIMILAR VECTORS → CLOSE IN VECTOR SPACE
#
# HOW DOES THE MODEL LEARN THIS?
# ────────────────────────────────
#   The model (all-MiniLM-L6-v2) is a Transformer neural network
#   trained on millions of sentence pairs. It learned that:
#     - "dog" and "puppy" should be close
#     - "dog" and "airplane" should be far apart
#
#   Training method: Contrastive learning
#     - Take similar sentences → push vectors CLOSER
#     - Take different sentences → push vectors APART
#
# WHY 384 DIMENSIONS?
# ────────────────────
#   More dimensions = more information captured.
#   384 is a good balance between accuracy and speed.
#   Larger models use 768 or 1024 dimensions.
#
# HOW IS THIS USED IN RAG?
# ─────────────────────────
#   1. When user uploads a document:
#      Each chunk → embedding → stored in FAISS
#
#   2. When user asks a question:
#      Question → embedding → search FAISS for nearest vectors
#      → nearest vectors = most relevant chunks
#
#   This is called SEMANTIC SEARCH (search by meaning, not keywords).
#   Traditional search: "knife" only matches "knife"
#   Semantic search: "knife" also matches "sharp weapon", "blade", "cutting tool"
# ============================================================

import numpy as np
from fastembed import TextEmbedding
from config import EMBEDDING_MODEL
from typing import List, Union

# Load the model once when the module is imported.
# fastembed uses ONNX runtime — no PyTorch needed, ~150MB RAM vs ~1.5GB.
print(f"[EMBEDDING ENGINE] Loading model: {EMBEDDING_MODEL}")
_fastembed_model_name = "sentence-transformers/all-MiniLM-L6-v2"
model = TextEmbedding(model_name=_fastembed_model_name)
print(f"[EMBEDDING ENGINE] Model loaded. Vector dimension: 384")


def embed_text(texts: Union[str, List[str]]) -> np.ndarray:
    """
    Convert one or more text strings into embedding vectors.

    Args:
        texts: A single string or a list of strings.

    Returns:
        numpy array of shape (n, 384) where n = number of input texts.
        Each row is a 384-dimensional vector.

    DEEP DIVE — What happens inside this function?
    ─────────────────────────────────────────────────
    1. TOKENIZATION:
       "The knife was found" → ["The", "knife", "was", "found"]
       Each token gets an ID from the model's vocabulary.

    2. TRANSFORMER ENCODING:
       Tokens pass through 6 transformer layers.
       Each layer has:
         - Self-attention (tokens look at each other)
         - Feed-forward network (non-linear transformation)
       Output: A vector for each token.

    3. POOLING:
       We have vectors for each token, but we need ONE vector for the
       entire sentence. Pooling strategies:
         - Mean pooling: Average all token vectors (most common)
         - CLS pooling: Use the [CLS] token's vector
         - Max pooling: Take element-wise maximum

    4. NORMALIZATION:
       The final vector is L2-normalized so that:
         - All vectors have length 1
         - Cosine similarity = simple dot product
    """
    if isinstance(texts, str):
        texts = [texts]

    # fastembed.embed() returns a generator — convert to numpy array
    embeddings = np.array(list(model.embed(texts)))

    return embeddings


def compute_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """
    Compute cosine similarity between two vectors.

    Cosine Similarity = (A · B) / (||A|| × ||B||)

    Range: -1 to +1
      +1 = identical meaning
       0 = completely unrelated
      -1 = opposite meaning

    Since our embeddings are L2-normalized, cosine similarity
    simplifies to just the dot product: A · B
    """
    return float(np.dot(vec_a, vec_b) / (np.linalg.norm(vec_a) * np.linalg.norm(vec_b)))
