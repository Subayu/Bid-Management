import os
import json
import logging
import re
import time
from typing import Any

# Truncation limit for LLM context
_MAX_TEXT_LEN = 6000
# Ollama can be slow (especially first run or on CPU); use 5 minutes
_OLLAMA_TIMEOUT_SEC = 300

logger = logging.getLogger(__name__)


def _mock_evaluate_bid(rfp_text: str, bid_text: str) -> dict[str, Any]:
    """Return a fixed mock response (fallback when Ollama is unreachable)."""
    time.sleep(1)
    return {
        "score": 85.5,
        "reasoning": "The bid meets most requirements but is missing the specific ISO certification details mentioned in the RFP. Good budget alignment.",
        "evaluation_source": "mock",
        "requirements_breakdown": [],
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
    out = {"score": None, "reasoning": "", "requirements_breakdown": []}
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
    """Call Ollama API directly with long timeout so the model has time to respond."""
    from ollama import Client

    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").strip()
    client = Client(host=base_url, timeout=_OLLAMA_TIMEOUT_SEC)

    system = (
        "You are a procurement expert. Analyze the Vendor's Bid against the RFP Requirements. "
        "Return ONLY a valid JSON object, no other text or markdown. "
        "The JSON must have: "
        '"score" (number 0-100), '
        '"reasoning" (string, 2-4 sentences explaining the score), '
        '"requirements_breakdown" (array of objects, each with "requirement" (short string), "compliant" (boolean), "note" (string)). '
        "List each distinct requirement from the RFP and whether the bid complies, with a brief note."
    )
    rfp_slice = (rfp_text or "")[:_MAX_TEXT_LEN]
    bid_slice = (bid_text or "")[:_MAX_TEXT_LEN]
    user_content = f"""RFP requirements:
{rfp_slice}

Bid text (extracted):
{bid_slice}

Return only the JSON object with keys score, reasoning, and requirements_breakdown."""

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
    return out


def evaluate_bid(rfp_text: str, bid_text: str) -> dict[str, Any]:
    """
    Compare bid text to RFP requirements.
    Uses Ollama when OLLAMA_BASE_URL is set; on failure logs and falls back to mock.
    Returns dict with score, reasoning, evaluation_source ("ollama" | "mock"), requirements_breakdown.
    """
    rfp_text = rfp_text or ""
    bid_text = bid_text or ""
    base_url = os.getenv("OLLAMA_BASE_URL", "").strip()

    if base_url:
        try:
            result = _ollama_evaluate_bid(rfp_text, bid_text)
            logger.info("Ollama evaluation succeeded, score=%s", result.get("score"))
            return result
        except Exception as e:
            logger.warning("Ollama evaluation failed, using mock: %s", e, exc_info=True)
            mock = _mock_evaluate_bid(rfp_text, bid_text)
            mock["evaluation_source"] = "mock"
            return mock
    return _mock_evaluate_bid(rfp_text, bid_text)
