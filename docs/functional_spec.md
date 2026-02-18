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
