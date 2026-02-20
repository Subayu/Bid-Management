# Scripts

## create_poc_v3_test_data.py

Creates test data for **POC v3** (Project & RFP Management): RFPs with workflow, criteria weights, timeline, team, and Vendor Q&A. Also creates a minimal sample PDF for bid upload tests.

**Requirements:** Backend running (e.g. `docker compose up -d backend` or `uvicorn app.main:app` from `backend/`).

**Run:**
```bash
# From repo root (Bid-Management/)
python scripts/create_poc_v3_test_data.py
```

**Output:**
- 2 RFPs (full POC v3 fields)
- 3 Q&A entries on first RFP (1 answered)
- `scripts/poc_v3_test_data.json` – created IDs
- `data/test_samples/sample_bid.pdf` – minimal PDF for bid upload

**Options:**
```bash
python scripts/create_poc_v3_test_data.py --base http://localhost:8001
# or
API_BASE=http://localhost:8001 python scripts/create_poc_v3_test_data.py
```

**Full test steps:** See [docs/TEST_POC_V3.md](../docs/TEST_POC_V3.md).
