# POC v3 – Test Cases (Project & RFP Management)

Use these test cases to verify workflow stages, criteria weights, timeline, team assignment, Publish, and Vendor Q&A.

---

## Prerequisites

1. **Backend and frontend running**
   ```bash
   docker compose up --build
   ```
   Or run backend and frontend separately (e.g. backend on port 8001, frontend on 3000).

2. **Create test data (run once, or after admin reset)**
   ```bash
   python scripts/create_poc_v3_test_data.py
   ```
   Optional: different API base:
   ```bash
   python scripts/create_poc_v3_test_data.py --base http://localhost:8001
   ```
   This creates:
   - 2 RFPs with full POC v3 fields (process type, weights, timeline dates, reviewers, approvers)
   - 3 Vendor Q&A entries on RFP 1 (one pre-answered)
   - `scripts/poc_v3_test_data.json` (IDs for reference)
   - `data/test_samples/sample_bid.pdf` (minimal PDF for bid upload tests)

3. **Persona:** Use **Bid Manager** for create RFP, Publish, Lock Bids, Answer Q&A. Use **Reviewer** or **Approver** where noted.

---

## Test Cases

### TC1: Create RFP – 4-step wizard

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Click **Create RFP** | Modal opens at Step 1 (Basics). |
| 1.2 | In **Load template**, select e.g. "Road Construction" | Title, Description, Requirements, Budget fill from template. Other fields (process type, weights, dates, team) unchanged. |
| 1.3 | Choose **Direct RFP** then **RFI → RFP** | Radio selection updates. |
| 1.4 | Change Title/Description/Requirements/Budget | Values update. |
| 1.5 | Click **Next** | Step 2 (Criteria) shows. |
| 2.1 | Set Technical 50, Financial 30, Non-functional 20 | Total 100%. |
| 2.2 | Change to 40, 30, 20 | Total 90%. Click **Next**. | Error or validation: "Weights must total exactly 100%". |
| 2.3 | Set to 40, 30, 30 | Total 100%. Click **Next**. | Step 3 (Timeline) shows. |
| 3.1 | Fill Publish, Q&A deadline, Submission, Review, Decision dates | All date pickers work. |
| 3.2 | Click **Next** | Step 4 (Team) shows. |
| 4.1 | Click some **Reviewers** and **Approvers** (chips) | Selected chips highlight (e.g. indigo). |
| 4.2 | Click **Create** | Modal closes; new RFP appears in list. |

**Pass:** Wizard runs end-to-end; template loads without breaking; weights must total 100%; RFP is created with all fields.

---

### TC2: RFP detail – Publish and Timeline

Use an RFP in **Draft** (e.g. one created in TC1 or from the seed script).

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Open RFP (Bid Manager) | RFP detail loads. |
| 2.2 | Check **Timeline** (top of page) | Five milestones: Publish → Q&A → Submission → Review → Decision. Dates match RFP; current phase (if dates set) is highlighted. |
| 2.3 | If **current_stage** is "Draft", click **Publish to Procurement Portal** | Button shows "Publishing…" then RFP updates; **current_stage** becomes "Published", status published; button no longer shown for Draft. |
| 2.4 | Reload page | Timeline and stage persist. |

**Pass:** Timeline shows all five dates; Publish changes stage to Published and hides the Publish button.

---

### TC3: Vendor Q&A tab

Use an RFP that has Q&A (e.g. RFP 1 from `create_poc_v3_test_data.py`).

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Open RFP → **Vendor Q&A** tab | List of questions; each shows vendor name, question, status (Answered/Unanswered), and answer if present. |
| 3.2 | In **Submit a question**, enter Vendor name and Question; click **Submit question** | New row appears in the list; status "Unanswered". |
| 3.3 | As **Bid Manager**, find an **Unanswered** question; type in the answer field and click **Answer** | Status becomes "Answered"; answer text appears; answer field clears. |
| 3.4 | Reload and switch back to Vendor Q&A | Same list and answers persist. |

**Pass:** Submit question and Answer (Bid Manager) work; list and statuses correct.

---

### TC4: Bid upload (existing flow) with sample PDF

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Open an RFP as Bid Manager | Upload Bid section visible (if not locked). |
| 4.2 | Choose file: `data/test_samples/sample_bid.pdf` (created by script) | File selected. |
| 4.3 | Click **Upload Bid** | Upload and vendor extraction run; new bid appears in Bids tab. |

**Pass:** Bid upload and extraction complete; bid appears in table.

---

### TC5: API-level checks (optional)

Backend base URL: `http://localhost:8001` (or your API base).

```bash
# Create RFP with POC v3 fields
curl -s -X POST http://localhost:8001/rfps \
  -H "Content-Type: application/json" \
  -d '{"title":"Curl Test RFP","description":"D","requirements":"R","process_type":"RFI -> RFP","weight_technical":40,"weight_financial":30,"weight_compliance":30}' \
  | python3 -m json.tool

# List RFPs (check process_type, current_stage, weights, dates, assigned_*)
curl -s http://localhost:8001/rfps | python3 -m json.tool

# Get one RFP (replace 1 with actual id)
curl -s http://localhost:8001/rfps/1 | python3 -m json.tool

# Publish (set current_stage)
curl -s -X PATCH http://localhost:8001/rfps/1 \
  -H "Content-Type: application/json" \
  -d '{"current_stage":"Published"}' | python3 -m json.tool

# List Q&A for RFP 1
curl -s http://localhost:8001/rfps/1/qa | python3 -m json.tool

# Submit question
curl -s -X POST http://localhost:8001/rfps/1/qa \
  -H "Content-Type: application/json" \
  -d '{"vendor_name":"Test Vendor","question":"Test question?"}' | python3 -m json.tool

# Answer (replace QA_ID with id from previous response)
curl -s -X PATCH http://localhost:8001/qa/QA_ID \
  -H "Content-Type: application/json" \
  -d '{"answer":"Test answer."}' | python3 -m json.tool
```

**Pass:** All endpoints return expected JSON; PATCH updates `current_stage` and RFP status.

---

## After admin reset

If you run **Admin → Reset** (or `POST /admin/reset`), the DB is wiped. Re-run:

```bash
python scripts/create_poc_v3_test_data.py
```

Then re-run the test cases above.

---

## Reference: created test data (from script)

After running `create_poc_v3_test_data.py`, see `scripts/poc_v3_test_data.json` for:

- `rfps[].id` – use in URLs `/rfps/<id>` and for Q&A tests
- `qa[].id` – use for PATCH `/qa/<id>` in curl tests

Sample PDF for bid upload: `data/test_samples/sample_bid.pdf`.
