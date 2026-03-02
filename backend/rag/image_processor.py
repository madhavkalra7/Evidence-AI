# ============================================================
# IMAGE PROCESSOR — Converts images to text using Groq Vision API
# ============================================================
#
# ╔══════════════════════════════════════════════════════════╗
# ║  THIS IS THE "MULTIMODAL" PART OF MULTIMODAL RAG.       ║
# ║  Images can't be directly embedded like text.           ║
# ║  We use Groq's Vision LLM to analyze images.            ║
# ╚══════════════════════════════════════════════════════════╝
#
# HOW IT WORKS:
# ──────────────
#   Instead of downloading heavy BLIP models locally,
#   we send the image to Groq's Llama-3.2 Vision model
#   via API. It understands images natively and can give
#   detailed forensic descriptions — no local GPU needed.
#
# FLOW IN OUR SYSTEM:
# ────────────────────
#   Crime scene photo
#        ↓ base64 encode
#   Send to Groq Vision API
#        ↓ LLM analyzes image
#   "A dimly lit room with a broken window, glass shards
#    scattered on the floor, an overturned table, and a
#    knife near the center of the room..."
#        ↓ Chunking
#   [chunk with description text]
#        ↓ Embedding
#   [0.12, -0.33, 0.78, ...]  ← now searchable like any text!
#        ↓ FAISS
#   Stored alongside PDF text chunks
# ============================================================

from groq import Groq
from PIL import Image
from typing import List, Dict
from config import GROQ_API_KEY
import base64
import io
import time

# ── Groq Vision Model ─────────────────────────────────────────
# Llama 4 Scout — multimodal model, supports image + text input
VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
client = Groq(api_key=GROQ_API_KEY)
print(f"[IMAGE PROCESSOR] Using Groq Vision API ({VISION_MODEL}) — no local model download needed.")


# ── Forensic analysis prompt ──────────────────────────────────
FORENSIC_VISION_PROMPT = """You are a forensic crime scene analyst examining this image.
Provide an EXHAUSTIVE and DETAILED description covering ALL of the following:

1. **Scene Overview**: What type of room/location is this? Lighting conditions? General state?
2. **All Visible Objects**: List EVERY object you can see — furniture, tools, weapons, items on surfaces, items on floor, wall decorations, etc.
3. **Damage & Disturbance**: Broken items, overturned furniture, displaced objects, forced entry signs, shattered glass, etc.
4. **Potential Weapons/Evidence**: Any knives, tools, sharp objects, blunt instruments, blood stains, drag marks, footprints, etc.
5. **Floor & Surfaces**: What is on the floor? Any debris, glass shards, liquid, scattered items?
6. **Entry/Exit Points**: Windows, doors — are they intact, broken, open, forced?
7. **Anomalies**: Anything unusual, out of place, or suspicious.

Be extremely thorough. Describe positions, colors, sizes, conditions. A forensic investigator will rely on your description to understand the scene without seeing the image.
Do NOT skip any detail, no matter how small."""


def _image_to_base64(image: Image.Image) -> str:
    """Convert a PIL Image to a base64-encoded JPEG string."""
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")


def _analyze_with_groq_vision(image: Image.Image, retries: int = 3) -> str:
    """
    Send an image to Groq Vision API for detailed forensic analysis.
    Retries on failure with exponential backoff.
    """
    image_b64 = _image_to_base64(image)

    for attempt in range(retries):
        try:
            response = client.chat.completions.create(
                model=VISION_MODEL,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": FORENSIC_VISION_PROMPT,
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_b64}",
                                },
                            },
                        ],
                    }
                ],
                max_tokens=1500,
                temperature=0.2,
            )
            result = response.choices[0].message.content.strip()
            print(f"[IMAGE PROCESSOR] Groq Vision analysis ({len(result)} chars):")
            print(f"[IMAGE PROCESSOR] ------- VISION RESULT -------")
            print(result[:800] + ("..." if len(result) > 800 else ""))
            print(f"[IMAGE PROCESSOR] ------- END RESULT -------")
            return result

        except Exception as e:
            print(f"[IMAGE PROCESSOR] Groq Vision attempt {attempt + 1}/{retries} failed: {e}")
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))

    return "Image analysis failed — Groq Vision API unavailable. A crime scene image was uploaded but could not be analyzed."


def image_to_caption(image_path: str) -> str:
    """
    Generate a rich forensic description for an image using Groq Vision API.
    """
    image = Image.open(image_path).convert("RGB")
    description = _analyze_with_groq_vision(image)
    return description


def image_bytes_to_caption(image_bytes: bytes) -> str:
    """
    Generate forensic description from raw image bytes (for API uploads).
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    description = _analyze_with_groq_vision(image)
    return description


def process_image(image_path: str, source_type: str = "scene_image") -> List[Dict]:
    """
    Convert an image to a document format compatible with the chunking pipeline.

    Args:
        image_path:  Path to the image file.
        source_type: "scene_image" or "evidence_image" (for metadata).

    Returns:
        List with one document dictionary containing the detailed description.
    """
    description = image_to_caption(image_path)

    type_label = "Crime Scene Image" if source_type == "scene_image" else "Physical Evidence Image"

    enriched_text = (
        f"[{type_label} Analysis]\n"
        f"{description}\n\n"
        f"Cross-reference these visual observations with the incident report for consistency."
    )

    return [{
        "text": enriched_text,
        "source": image_path,
        "type": source_type,
        "page": 0
    }]
