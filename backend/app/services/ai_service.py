import os
import json
import logging
import re
import time
from typing import Any

# Truncation limit for LLM context
_MAX_TEXT_LEN = 6000
# Ollama can be slow (first run or on CPU). Use 2 min for extraction so we don't hang; eval can stay longer.
_OLLAMA_TIMEOUT_SEC = 300
_OLLAMA_EXTRACTION_TIMEOUT_SEC = 120

logger = logging.getLogger(__name__)


def _mock_evaluate_bid(rfp_text: str, bid_text: str) -> dict[str, Any]:
    """Return a fixed mock response (fallback when Ollama is unreachable)."""
    time.sleep(1)
    # Provide a comprehensive requirements_breakdown so rationale table is useful
    requirements_breakdown = [
        {"requirement": "Technical capability and experience", "compliant": True, "note": "Bid demonstrates relevant experience."},
        {"requirement": "Certifications (e.g. ISO, industry)", "compliant": False, "note": "ISO 9001 claimed; needs verification."},
        {"requirement": "Budget and pricing", "compliant": True, "note": "Within stated range."},
        {"requirement": "Delivery timeline", "compliant": True, "note": "12 weeks proposed."},
        {"requirement": "Support and warranty", "compliant": True, "note": "Standard terms offered."},
    ]
    return {
        "score": 85.5,
        "reasoning": "The bid meets most requirements but is missing the specific ISO certification details mentioned in the RFP. Good budget alignment.",
        "evaluation_source": "mock",
        "requirements_breakdown": requirements_breakdown,
        "annotations": [
            {"quote": "ISO 9001 certification to be confirmed", "reason": "Claimed certification should be verified with the vendor or issuing body.", "page": 1},
            {"quote": "Delivery timeline 12 weeks from contract", "reason": "Verify feasibility and resource commitment.", "page": 2},
            {"quote": "Team comprises 5 FTE with PMP certification", "reason": "Verify team availability and credentials.", "page": 1},
            {"quote": "Pricing valid for 90 days", "reason": "Confirm validity period with vendor.", "page": 2},
        ],
    }


def _fix_trailing_commas(s: str) -> str:
    """Remove trailing commas before ] or } so JSON parses."""
    s = re.sub(r",\s*}", "}", s)
    s = re.sub(r",\s*]", "]", s)
    return s


def _parse_json_from_response(text: str) -> dict[str, Any]:
    """Extract a JSON object from model output; tolerate minor LLM JSON errors."""
    text = (text or "").strip()
    if "```json" in text:
        text = text.split("```json", 1)[-1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[-1].split("```", 1)[0].strip()
    start = text.find("{")
    if start >= 0:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    text = text[start : i + 1]
                    break
    # Try strict parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Fix common LLM mistakes: trailing commas
    try:
        return json.loads(_fix_trailing_commas(text))
    except json.JSONDecodeError:
        pass
    # Last resort: extract score and reasoning with regex so we still use Ollama result
    out = {"score": None, "reasoning": "", "requirements_breakdown": [], "annotations": []}
    m = re.search(r'"score"\s*:\s*(\d+(?:\.\d+)?)', text)
    if m:
        try:
            out["score"] = float(m.group(1))
        except ValueError:
            pass
    m = re.search(r'"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)"', text)
    if m:
        out["reasoning"] = m.group(1).encode().decode("unicode_escape")
    if out["score"] is not None or out["reasoning"]:
        return out
    raise json.JSONDecodeError("Could not extract valid JSON or score/reasoning", text, 0)


def _ollama_evaluate_bid(rfp_text: str, bid_text: str) -> dict[str, Any]:
    """Call Ollama API; bid_text may be summary+excerpt from upload for faster eval."""
    from ollama import Client

    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").strip()
    client = Client(host=base_url, timeout=_OLLAMA_TIMEOUT_SEC)

    system = (
        "You are a procurement expert. Analyze the Vendor's Bid against the RFP Requirements. "
        "Return ONLY a valid JSON object, no other text or markdown. "
        "The JSON must have: "
        '"score" (number 0-100), '
        '"reasoning" (string, 2-4 sentences explaining the score), '
        '"requirements_breakdown" (array: list ONLY the actual requirements/criteria/deliverables stated in the RFP requirements text—one object per requirement with "requirement", "compliant", "note". '
        "Do NOT list document section headers, table-of-contents titles, or bid structure (e.g. 'WEBSITE DESIGN', 'ABOUT THE COUNTY', 'PROJECT OVERVIEW', 'Scope of Work'). Each entry must be a specific requirement or criterion from the RFP, not a heading or section name. "
        '"annotations" (array of objects for areas that need further review: each with "quote" (short excerpt from the bid), "reason" (why it needs verification), and optional "page" (1-based page number where the quoted text actually appears in the document—verify the quote appears on that page). '
        "Include 5-10 annotations for claims, certifications, timelines, commitments, or other areas that a reviewer should verify (aim for more rather than fewer)."
    )
    rfp_slice = (rfp_text or "")[:_MAX_TEXT_LEN]
    bid_slice = (bid_text or "")[:_MAX_TEXT_LEN]
    user_content = f"""RFP requirements (use ONLY these to build requirements_breakdown—each item must be a real requirement/criterion from below, NOT a section header or document title):
{rfp_slice}

Bid (summary/excerpt from document):
{bid_slice}

Return only the JSON object with keys score, reasoning, requirements_breakdown (one entry per RFP requirement—no section headers), and annotations."""

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]
    response = client.chat(model="llama3", messages=messages, format="json")
    msg = getattr(response, "message", None) or (response.get("message") if isinstance(response, dict) else None)
    text = (getattr(msg, "content", None) if msg is not None else None) or (msg.get("content") if isinstance(msg, dict) else None) or ""
    out = _parse_json_from_response(text)
    out["evaluation_source"] = "ollama"
    if "requirements_breakdown" not in out or not isinstance(out["requirements_breakdown"], list):
        out["requirements_breakdown"] = []
    if "annotations" not in out or not isinstance(out["annotations"], list):
        out["annotations"] = []
    # Normalize each annotation: quote, reason, optional page
    def _norm_ann(a: dict) -> dict:
        ann = {"quote": str(a.get("quote", "")).strip() or "Excerpt", "reason": str(a.get("reason", "")).strip() or "Needs review"}
        p = a.get("page")
        if isinstance(p, int) and p >= 1:
            ann["page"] = p
        elif isinstance(p, (float, str)) and int(p) >= 1:
            ann["page"] = int(p)
        return ann
    out["annotations"] = [_norm_ann(a) for a in out["annotations"][:15] if isinstance(a, dict)]
    return out


def _bid_text_for_eval(bid_text: str, evaluation_summary: str | None, text_chunks: list[str] | None) -> str:
    """Prefer stored summary + first chunk for faster, smaller eval; else full text. Chunking done at upload."""
    if evaluation_summary and evaluation_summary.strip():
        prefix = (evaluation_summary or "").strip()
        if text_chunks and len(text_chunks) > 0:
            prefix += "\n\n[Excerpt]\n" + (text_chunks[0][:1200] if len(text_chunks[0]) > 1200 else text_chunks[0])
        return prefix[:_MAX_TEXT_LEN]
    if text_chunks and len(text_chunks) > 0:
        # use pre-chunked content from upload (concatenate up to limit)
        out = []
        n = 0
        for c in text_chunks:
            if n + len(c) > _MAX_TEXT_LEN:
                break
            out.append(c)
            n += len(c)
        return "\n\n".join(out) if out else (bid_text or "")[:_MAX_TEXT_LEN]
    return (bid_text or "")[:_MAX_TEXT_LEN]


def evaluate_bid(
    rfp_text: str,
    bid_text: str,
    evaluation_summary: str | None = None,
    text_chunks: list[str] | None = None,
) -> dict[str, Any]:
    """
    Compare bid to RFP requirements. Uses evaluation_summary + chunks from upload when present (faster).
    """
    rfp_text = rfp_text or ""
    bid_for_eval = _bid_text_for_eval(bid_text, evaluation_summary, text_chunks)
    base_url = os.getenv("OLLAMA_BASE_URL", "").strip()

    if base_url:
        try:
            result = _ollama_evaluate_bid(rfp_text, bid_for_eval)
            logger.info("Ollama evaluation succeeded, score=%s", result.get("score"))
            return result
        except Exception as e:
            logger.warning("Ollama evaluation failed, using mock: %s", e, exc_info=True)
            mock = _mock_evaluate_bid(rfp_text, bid_for_eval)
            mock["evaluation_source"] = "mock"
            return mock
    return _mock_evaluate_bid(rfp_text, bid_for_eval)


# --- Vendor extraction (separate prompt for ingestion) ---

_EXTRACTION_MAX_LEN = 8000
_CHUNK_SIZE = 1800  # chars per chunk for reuse at evaluation
_CHUNK_OVERLAP = 100


def chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks for consistent reuse at evaluation. Done once at upload."""
    if not text or not text.strip():
        return []
    text = text.strip()
    chunks = []
    start = 0
    while start < len(text):
        end = start + _CHUNK_SIZE
        if end < len(text):
            # try to break at paragraph or sentence
            break_at = text.rfind("\n\n", start, end + 1)
            if break_at > start:
                end = break_at + 2
            else:
                break_at = text.rfind(". ", start, end + 1)
                if break_at > start:
                    end = break_at + 2
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end - _CHUNK_OVERLAP if end < len(text) else len(text)
    return chunks


def _mock_extract_vendor(bid_text: str) -> dict[str, Any]:
    """Fallback when LLM unavailable."""
    return {
        "vendor": {
            "name": "Extracted Vendor (Mock)",
            "address": None,
            "website": None,
            "domain": None,
        },
        "representatives": [
            {"name": "Contact Person", "email": None, "phone": None, "designation": "Representative"},
        ],
        "bid_summary": "Bid document submitted for evaluation. Details available in full text." if bid_text else None,
    }


def _parse_extraction_json(text: str) -> dict[str, Any]:
    """Parse vendor extraction JSON from LLM."""
    text = (text or "").strip()
    if "```json" in text:
        text = text.split("```json", 1)[-1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[-1].split("```", 1)[0].strip()
    start = text.find("{")
    if start >= 0:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    text = text[start : i + 1]
                    break
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return json.loads(_fix_trailing_commas(text))
    except Exception:
        return _mock_extract_vendor("")


def _ollama_extract_vendor(bid_text: str) -> dict[str, Any]:
    """Extract vendor, representatives, and a short bid summary from bid text via Ollama (one call for speed)."""
    from ollama import Client

    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").strip()
    timeout = _OLLAMA_EXTRACTION_TIMEOUT_SEC
    logger.info("Vendor extraction: calling Ollama (timeout=%ss, text_len=%s)", timeout, len(bid_text or ""))
    client = Client(host=base_url, timeout=timeout)

    system = (
        "You extract structured information from bid documents. "
        "Return ONLY a valid JSON object, no other text or markdown. "
        'The JSON must have: '
        '"vendor" (object with "name", "address", "website", "domain"). '
        '"domain" is the company domain from email or website (e.g. acme.com). '
        '"representatives" (array of objects: "name", "email", "phone", "designation"). '
        '"bid_summary" (string: 2-4 sentences summarizing the bid content, scope, and key commitments for later evaluation). '
        "Use null for any missing field. Be concise."
    )
    bid_slice = (bid_text or "")[:_EXTRACTION_MAX_LEN]
    user_content = f"""Bid document text:\n{bid_slice}\n\nReturn only the JSON with "vendor", "representatives", and "bid_summary"."""

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]
    response = client.chat(model="llama3", messages=messages, format="json")
    msg = getattr(response, "message", None) or (response.get("message") if isinstance(response, dict) else None)
    text = (getattr(msg, "content", None) if msg is not None else None) or (msg.get("content") if isinstance(msg, dict) else None) or ""
    out = _parse_extraction_json(text)
    if "bid_summary" not in out or not out["bid_summary"]:
        out["bid_summary"] = (bid_text or "")[:800].strip() or None
    return out


def extract_vendor_and_rep(bid_text: str) -> dict[str, Any]:
    """
    Extract vendor details and representative contacts from bid text.
    Returns dict with "vendor" (name, address, website, domain) and "representatives" (list of name, email, phone, designation).
    Uses Ollama when available (2 min timeout); otherwise mock.
    """
    bid_text = bid_text or ""
    base_url = os.getenv("OLLAMA_BASE_URL", "").strip()
    if base_url:
        try:
            out = _ollama_extract_vendor(bid_text)
            logger.info("Vendor extraction succeeded, vendor=%s", out.get("vendor", {}).get("name"))
            return out
        except Exception as e:
            logger.warning("Vendor extraction failed (Ollama slow/unreachable?), using mock: %s", e, exc_info=True)
    else:
        logger.info("Vendor extraction: no OLLAMA_BASE_URL, using mock")
    return _mock_extract_vendor(bid_text)


def evaluate_bid_with_context(
    rfp_text: str,
    bid_text: str,
    human_notes_context: str | None,
    evaluation_summary: str | None = None,
    text_chunks: list[str] | None = None,
) -> dict[str, Any]:
    """
    Same as evaluate_bid but optionally include reviewer human notes as context for re-evaluation.
    """
    if not (human_notes_context and human_notes_context.strip()):
        return evaluate_bid(rfp_text, bid_text, evaluation_summary=evaluation_summary, text_chunks=text_chunks)
    rfp_text = rfp_text or ""
    bid_text = bid_text or ""
    base_url = os.getenv("OLLAMA_BASE_URL", "").strip()
    if not base_url:
        return _mock_evaluate_bid(rfp_text, bid_text)
    try:
        from ollama import Client
        client = Client(host=base_url, timeout=_OLLAMA_TIMEOUT_SEC)
        system = (
            "You are a procurement expert. Analyze the Vendor's Bid against the RFP Requirements. "
            "A reviewer has provided additional context or disagreement; consider it when scoring. "
            "Return ONLY a valid JSON object with: "
            '"score" (number 0-100), "reasoning" (string), '
            '"requirements_breakdown" (array: list ONLY actual RFP requirements/criteria as separate objects with "requirement", "compliant", "note". Do NOT list section headers, document titles, or bid structure like "WEBSITE DESIGN", "PROJECT OVERVIEW", "Scope of Work".), '
            '"annotations" (array of objects with "quote", "reason", optional "page" (1-based page where the quote appears). Include 5-10 annotations for areas to verify.)'
        )
        rfp_slice = (rfp_text or "")[:_MAX_TEXT_LEN]
        bid_slice = (bid_text or "")[:_MAX_TEXT_LEN]
        user_content = f"""RFP requirements (requirements_breakdown must list only real requirements/criteria from below—NOT section headers or document titles):\n{rfp_slice}\n\nBid text:\n{bid_slice}\n\nReviewer context/notes (including annotation notes):\n{human_notes_context[:2000]}\n\nReturn only the JSON object with keys score, reasoning, requirements_breakdown (one per RFP requirement, no headers), annotations (5-10 items with quote, reason, page where quote appears)."""
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ]
        response = client.chat(model="llama3", messages=messages, format="json")
        msg = getattr(response, "message", None) or (response.get("message") if isinstance(response, dict) else None)
        text = (getattr(msg, "content", None) if msg is not None else None) or (msg.get("content") if isinstance(msg, dict) else None) or ""
        out = _parse_json_from_response(text)
        out["evaluation_source"] = "ollama"
        if "requirements_breakdown" not in out or not isinstance(out["requirements_breakdown"], list):
            out["requirements_breakdown"] = []
        if "annotations" not in out or not isinstance(out["annotations"], list):
            out["annotations"] = []
        def _norm_ann(a: dict) -> dict:
            ann = {"quote": str(a.get("quote", "")).strip() or "Excerpt", "reason": str(a.get("reason", "")).strip() or "Needs review"}
            p = a.get("page")
            if isinstance(p, int) and p >= 1:
                ann["page"] = p
            elif isinstance(p, (float, str)) and int(p) >= 1:
                ann["page"] = int(p)
            return ann
        out["annotations"] = [_norm_ann(a) for a in out["annotations"][:15] if isinstance(a, dict)]
        return out
    except Exception as e:
        logger.warning("Re-evaluation with context failed, using standard eval: %s", e)
        return evaluate_bid(rfp_text, bid_text)
