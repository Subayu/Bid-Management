#!/usr/bin/env python3
"""
Create test data for POC v3 (Project & RFP Management).

Run with backend up: docker compose up -d backend
  OR: uvicorn app.main:app --reload (from backend dir)

Usage:
  python scripts/create_poc_v3_test_data.py
  python scripts/create_poc_v3_test_data.py --base http://localhost:8001

Writes: scripts/poc_v3_test_data.json with created RFP and Q&A IDs.
Creates: data/test_samples/sample_bid.pdf (minimal PDF for bid upload tests).
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

# Default: backend on port 8001 (Docker or local)
BASE_URL = os.environ.get("API_BASE", "http://localhost:8001").rstrip("/")


def request(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{BASE_URL}{path}"
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8") if e.fp else ""
        raise SystemExit(f"HTTP {e.code} {path}: {err_body}")
    except urllib.error.URLError as e:
        raise SystemExit(f"Request failed (is the backend running at {BASE_URL}?): {e.reason}")


def create_rfp(payload: dict) -> dict:
    return request("POST", "/rfps", body=payload)


def create_qa(rfp_id: int, vendor_name: str, question: str) -> dict:
    return request("POST", f"/rfps/{rfp_id}/qa", body={"vendor_name": vendor_name, "question": question})


def create_minimal_pdf(out_path: Path) -> None:
    """Write a minimal valid PDF (one page with text) for bid upload testing."""
    # Minimal PDF 1.4, one page, with a short text stream (hex-encoded for safe embedding)
    content = (
        b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n"
        b"2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n"
        b"3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n"
        b"/Contents 4 0 R\n/Resources <<\n/Font <<\n/F1 5 0 R\n>>\n>>\n>>\nendobj\n"
        b"4 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(Sample bid for POC v3 test.) Tj\nET\nendstream\nendobj\n"
        b"5 0 obj\n<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\nendobj\n"
        b"xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000264 00000 n \n0000000351 00000 n \n"
        b"trailer\n<<\n/Size 6\n/Root 1 0 R\n>>\nstartxref\n434\n%%EOF\n"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(content)
    print(f"  Created: {out_path}")


def main() -> None:
    global BASE_URL
    if "--help" in sys.argv or "-h" in sys.argv:
        print(__doc__)
        sys.exit(0)
    for i, arg in enumerate(sys.argv):
        if arg == "--base" and i + 1 < len(sys.argv):
            BASE_URL = sys.argv[i + 1].rstrip("/")
            break

    print(f"Using API base: {BASE_URL}")
    print("Creating POC v3 test data...")

    # Dates for timeline (spread over next 60 days)
    today = datetime.utcnow().date()
    publish = today
    qa_deadline = today + timedelta(days=7)
    submission = today + timedelta(days=21)
    review = today + timedelta(days=35)
    decision = today + timedelta(days=45)

    # --- RFP 1: Full POC v3 fields, Direct RFP ---
    rfp1 = create_rfp({
        "title": "POC v3 Test RFP — IT Services",
        "description": "Test RFP for POC v3 workflow, criteria, timeline, and Q&A.",
        "requirements": "Must support SSO. Minimum 3 years in government sector.",
        "budget": 150000,
        "process_type": "Direct RFP",
        "weight_technical": 50,
        "weight_financial": 30,
        "weight_compliance": 20,
        "publish_date": publish.isoformat(),
        "qa_deadline": qa_deadline.isoformat(),
        "submission_deadline": submission.isoformat(),
        "review_date": review.isoformat(),
        "decision_date": decision.isoformat(),
        "assigned_reviewers": ["Alice (Reviewer)", "Bob (Reviewer)"],
        "assigned_approvers": ["Dave (Approver)"],
    })
    rfp1_id = rfp1["id"]
    print(f"  RFP 1 created: id={rfp1_id} ({rfp1['title'][:40]}...)")

    # --- RFP 2: RFI -> RFP, different weights ---
    rfp2 = create_rfp({
        "title": "POC v3 Test RFP — RFI to RFP",
        "description": "Two-stage process test.",
        "requirements": "RFI response required before full RFP.",
        "budget": 80000,
        "process_type": "RFI -> RFP",
        "weight_technical": 40,
        "weight_financial": 35,
        "weight_compliance": 25,
        "publish_date": publish.isoformat(),
        "qa_deadline": qa_deadline.isoformat(),
        "submission_deadline": submission.isoformat(),
        "review_date": review.isoformat(),
        "decision_date": decision.isoformat(),
        "assigned_reviewers": ["Carol (Reviewer)"],
        "assigned_approvers": ["Eve (Approver)"],
    })
    rfp2_id = rfp2["id"]
    print(f"  RFP 2 created: id={rfp2_id}")

    # --- Q&A for RFP 1 ---
    qa1 = create_qa(rfp1_id, "Acme Corp", "What is the exact submission format (PDF only or also Word)?")
    qa2 = create_qa(rfp1_id, "Beta Inc", "Can we submit multiple proposals for different lots?")
    qa3 = create_qa(rfp1_id, "Acme Corp", "When will the shortlist be announced?")
    print(f"  Q&A created for RFP {rfp1_id}: 3 questions (1–2 unanswered for Answer testing)")

    # Answer one so we have a mix of Answered/Unanswered
    request("PATCH", f"/qa/{qa2['id']}", body={"answer": "Yes, you may submit separate proposals per lot. Indicate the lot number in the subject line."})
    print(f"  Answered one Q&A (id={qa2['id']}) so list shows both statuses.")

    # --- Write manifest for test runs ---
    script_dir = Path(__file__).resolve().parent
    manifest = {
        "base_url": BASE_URL,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "rfps": [
            {"id": rfp1_id, "title": rfp1["title"], "note": "Has Q&A; use for Publish + Timeline + Q&A tests"},
            {"id": rfp2_id, "title": rfp2["title"], "note": "RFI -> RFP; use for wizard/display tests"},
        ],
        "qa": [{"id": qa1["id"], "rfp_id": rfp1_id}, {"id": qa2["id"], "rfp_id": rfp1_id}, {"id": qa3["id"], "rfp_id": rfp1_id}],
    }
    manifest_path = script_dir / "poc_v3_test_data.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"  Manifest: {manifest_path}")

    # --- Minimal PDF for bid upload ---
    repo_root = script_dir.parent
    sample_pdf = repo_root / "data" / "test_samples" / "sample_bid.pdf"
    create_minimal_pdf(sample_pdf)

    print("\nDone. Next:")
    print("  1. Open http://localhost:3000/rfps and confirm both RFPs appear.")
    print("  2. Open RFP 1 → check Timeline, Publish button (Bid Manager), and Vendor Q&A tab.")
    print("  3. Run through TEST_POC_V3.md for full test cases.")


if __name__ == "__main__":
    main()
