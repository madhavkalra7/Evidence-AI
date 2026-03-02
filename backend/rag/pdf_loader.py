# ============================================================
# PDF LOADER — Extracts text from uploaded PDF files
# ============================================================
#
# HOW IT WORKS:
#   1. PyPDF reads the PDF file page by page
#   2. Each page's text is extracted
#   3. We combine all pages into one string
#   4. We also track which page each piece of text came from
#      (this is "metadata" — very important for RAG traceability)
#
# WHY PAGE TRACKING?
#   When the LLM answers a question, we want to tell the user:
#   "This information came from Page 3 of incident_report.pdf"
#   This builds trust and allows verification.
# ============================================================

from pypdf import PdfReader
from typing import List, Dict


def load_pdf(file_path: str) -> List[Dict[str, str]]:
    """
    Extract text from a PDF file, preserving page-level metadata.

    Args:
        file_path: Path to the PDF file on disk.

    Returns:
        A list of dictionaries, each containing:
          - "text": The extracted text from one page
          - "page": The page number (1-indexed)
          - "source": The file path (for traceability)
          - "type": Always "pdf" (helps distinguish from image sources)

    DEEP DIVE — Why return structured data instead of plain text?
        In a RAG system, METADATA is crucial. When we retrieve a chunk later,
        we need to know WHERE it came from. Without metadata, the user gets
        an answer but can't verify it. With metadata, we can say:
        "Based on Page 5 of incident_report.pdf"
    """
    reader = PdfReader(file_path)
    pages = []

    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text and text.strip():  # Skip empty pages
            pages.append({
                "text": text.strip(),
                "page": i + 1,
                "source": file_path,
                "type": "pdf"
            })

    return pages
