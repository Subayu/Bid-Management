# ShieldProcure — Functional Specification

## Overview

ShieldProcure is a **System of Intelligence** for procurement: a bid management AI platform that supports RFP lifecycle, bid submission, and role-based workflows.

**Stack:** Python FastAPI (Backend), Next.js 14 + Tailwind (Frontend), Postgres (DB). Optional Ollama (or OpenAI) for AI bid evaluation.

- **System architecture:** See [ARCHITECTURE.md](./ARCHITECTURE.md) for services, data flow, backend/frontend structure, and API summary.

---

## What Has Been Done (Implemented)

### Scaffold & core

- Backend: FastAPI, SQLAlchemy, Postgres, Docker; `GET /health`; models for RFP, Bid, BidAuditEvent.
- Frontend: Next.js 14, Tailwind, Docker; RoleContext (Admin, Bid Manager, Reviewer, Auditor, Approver); RoleSwitcher in sidebar; Layout with dark sidebar and cream main area; API client using `NEXT_PUBLIC_API_URL`.

### RFP & bids

- **RFP CRUD:** Create RFP (title, description, requirements, budget); list RFPs; RFP detail. RFP templates (e.g. Road Construction, IT Upgrade, Website Redesign) in Create RFP modal.
- **Bid upload:** Upload PDF per RFP (or from Bids tab); store file under `data/uploads`; extract text (PyMuPDF); store vendor name, file path, extracted text; list bids per RFP and all bids.

### AI evaluation & review

- **AI evaluation:** Run evaluation from bid detail; backend uses Ollama (or mock) to score and explain; store ai_score, ai_reasoning, ai_requirements_breakdown; optional requirements breakdown table in UI; collapsible rationale.
- **Human review:** Reviewer/Bid Manager can set human score and notes; PATCH stored and audit event recorded.
- **Approver workflow:** Approver persona can set bid status to Approved or Rejected; PATCH `/bids/{id}/status`; status badges (green/red) on bid list and detail.

### Audit & UX

- **Audit trail:** BidAuditEvent for created, evaluated, human_review, approved, rejected; optional actor (persona); bid detail shows Audit trail section.
- **Dashboard:** Command-center style with KPI cards (Active RFPs, Pending Reviews, Avg Savings), Bids by Risk pie, Average Vendor Scores bar, Recent Activity (mock data).
- **Consistent layout:** Same padding (e.g. `p-8`) on Dashboard, RFPs, and Bids pages so content is spaced consistently from the sidebar.

### Demo & ops

- **Demo reset:** `POST /admin/reset` clears all RFPs, bids, audit events, and uploaded files for a fresh demo run.

---

## POC v2 — Workflow Release (Implemented)

### 1. Automated vendor extraction (during ingestion)

- On PDF upload, raw text is sent to the LLM; a dedicated extraction prompt returns structured **Vendor** (name, address, website, domain) and **Representatives** (name, email, phone, designation).
- Backend matches vendor by name or website; if not found, creates **Vendor** and **VendorRep** records and links the **Bid** to the vendor.
- **Frontend:** Manual "Vendor name" input removed; upload is PDF-only. After upload, a read-only "Extracted vendor (for confirmation)" block shows vendor and reps (with verification icons when available).

### 2. Re-evaluation loop & history

- **Submit for Re-evaluation:** When a reviewer has added human notes or changed human score, they can click "Submit for Re-evaluation". The AI runs again with reviewer notes as context.
- **BidEvaluationHistory:** Each re-evaluation archives the current ai_score, ai_reasoning, human_score, human_notes into **BidEvaluationHistory** before updating the bid.
- **View History:** Bid detail includes a "View history" link that opens a modal listing past evaluation versions (scores and timestamps).

### 3. Comparative analysis dashboard

- On **RFP detail**, a **Comparative Analysis** tab shows a matrix of bids that have moved past "Uploaded": rows = vendors, columns = AI score, Human score, Status (and optional requirement-level data). Fetched via `GET /rfps/{id}/comparative`.

### 4. Digital agents (simulated for POC)

- **Website agent:** After vendor extraction, the backend pings the extracted website URL (HTTP HEAD); result stored as `website_verified` (true/false).
- **Phone agent:** Validates phone number format (E.164 or loose format); result stored as `phone_verified` on each representative.
- **UI:** "Verified ✓" (green) or "Unreachable ✗" (red) icons next to website and phone in vendor/rep display.

### 5. Locking & immutability

- **Lock Bids for Final Decision:** Bid Manager can click this on the RFP page; it sets **RFP.bids_locked = true** (`PATCH /rfps/{id}/lock`). Once locked, reviewers cannot change notes or trigger re-evaluation.
- **Final bid state:** When an Approver sets a bid to Approved or Rejected, the bid becomes read-only: "Save review", "Run AI evaluation", and "Submit for Re-evaluation" are disabled. The backend rejects PATCH/POST to modify or re-evaluate such bids.

### 6. AI annotations (areas for review)

- **Evaluation annotations:** When the AI evaluates a bid, it returns an **annotations** array: short excerpts from the bid and a **reason** (why each needs further review or verification). Stored as **Bid.ai_annotations** (JSON). Each annotation may include a **page** (1-based) for “Show in document.”
- **Page correction:** Per-page text is stored at upload (**Bid.text_chunks**, JSON array). After evaluation, annotation page numbers are corrected by searching for each quote in the corresponding page text so “Show in document (page N)” scrolls to the correct page.
- **UI:** On the bid detail page, an **"Areas for review"** section lists these annotations so reviewers can see what to verify. Reviewers can add notes per annotation, use “Show in document” to scroll the left-pane PDF to that page, and run Verify online / Email vendor. Re-evaluation includes all notes.

---

## Phase 1 POC — Requirements

### 1. RFP Creation

- **Goal:** Users can create and manage Request for Proposals (RFPs).
- **Scope (POC):**
  - Create an RFP with: title, description, status (draft / published / closed), optional closing date.
  - List RFPs; filter by status if needed.
  - Backend: SQLAlchemy model `RFP` with fields above; API endpoints to create and list RFPs (to be implemented after scaffold).
  - Frontend: RFP list view and a simple “New RFP” form (can follow after initial scaffold).

### 2. Bid Upload

- **Goal:** Users can upload and associate bids with an RFP.
- **Scope (POC):**
  - Upload a bid document (file) linked to an RFP; store metadata (title, summary, file path, status).
  - Backend: SQLAlchemy model `Bid` with `rfp_id`, title, summary, file_path, status; file upload endpoint and storage under `/data/uploads` (or equivalent).
  - Frontend: Bid upload UI per RFP and list of bids (to be implemented after scaffold).

### 3. Role Switching (POC Auth Mock)

- **Goal:** Simulate different user roles for the POC without real authentication.
- **Scope (POC):**
  - **Personas:** Admin, Bid Manager, Reviewer, Auditor.
  - **Implementation:**
    - Global state for “Current Persona” (e.g. React Context `RoleContext`).
    - A **RoleSwitcher** component: visible dropdown in the top navbar to switch roles instantly.
  - UI and API behaviour may later vary by persona (e.g. visibility of actions, tabs); for POC, switching the persona in the navbar is sufficient.

### 4. Scaffold Deliverables (Done)

- **Backend:** `requirements.txt`, Python 3.11 Dockerfile, FastAPI app with `GET /health`, SQLAlchemy models for `RFP` and `Bid`.
- **Frontend:** Node 18 Dockerfile, Next.js app structure with:
  - `RoleContext` for current persona state.
  - `RoleSwitcher` in navbar.
  - Standard `Layout` including Navbar.
  - API client base URL: `http://localhost:8001` (or `NEXT_PUBLIC_API_URL`).
- **Docs:** This functional spec with Phase 1 POC requirements.

---

## Out of Scope for Phase 1 POC

- Real authentication (SSO, login, JWT).
- Full RBAC enforcement (only persona switching for UX).
- Production-grade file validation, virus scanning, or storage quotas.
- Advanced AI features (LangChain/Chroma will be wired in later phases).

---

## Running the Stack

```bash
docker-compose up
```

- **Backend:** http://localhost:8001 — health: `GET /health`
- **Frontend:** http://localhost:3000
- **Postgres:** localhost:5432 (user: shield_user, db: shield_procure)

Frontend should use `NEXT_PUBLIC_API_URL=http://localhost:8001` when calling the backend (set in docker-compose or `.env.local` for local dev).

**Demo reset:** `curl -X POST http://localhost:8001/admin/reset` clears all data and uploads for a fresh demo.
