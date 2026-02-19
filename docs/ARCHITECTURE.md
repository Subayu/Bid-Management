# ShieldProcure — System Architecture

## Overview

ShieldProcure is a bid management AI POC with a three-tier stack: **Next.js** frontend, **FastAPI** backend, and **PostgreSQL** database. Optional **Ollama** (or OpenAI) provides AI bid evaluation. All services run via **Docker Compose** for local development and demos.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser (http://localhost:3000)                                        │
│  Next.js 14 + Tailwind, RoleContext, Recharts                           │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ NEXT_PUBLIC_API_URL
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Backend (http://localhost:8001)                                         │
│  FastAPI, SQLAlchemy, PyMuPDF, Ollama client                             │
│  • REST API (RFPs, Bids, Evaluate, Admin Reset)                         │
│  • Static files: /static → data/uploads                                 │
└──────────────┬────────────────────────────────────┬─────────────────────┘
               │ DATABASE_URL                        │ OLLAMA_BASE_URL (optional)
               ▼                                    ▼
┌──────────────────────────────┐    ┌─────────────────────────────────────┐
│  PostgreSQL (localhost:5432) │    │  Ollama (host.docker.internal:11434) │
│  shield_procure DB            │    │  LLM for bid evaluation              │
│  rfps, bids, bid_audit_events │    └─────────────────────────────────────┘
└──────────────────────────────┘
```

---

## Services

| Service   | Image / Build      | Port (host) | Purpose |
|----------|--------------------|-------------|---------|
| **db**   | postgres:15-alpine | 5432        | Persistent database (volume `postgres_data`) |
| **backend** | ./backend Dockerfile | 8001     | FastAPI app, file uploads, OCR, AI evaluation |
| **frontend** | ./frontend Dockerfile | 3000   | Next.js app (dev server) |

- **Backend** connects to **db** via `DATABASE_URL`; connects to **Ollama** on the host via `host.docker.internal:11434` when `OLLAMA_BASE_URL` is set.
- **Frontend** calls the backend at `NEXT_PUBLIC_API_URL` (http://localhost:8001).

---

## Data Flow

1. **RFP lifecycle:** Create RFP via `POST /rfps` → list `GET /rfps` → detail `GET /rfps/{id}`.
2. **Bid upload:** User uploads PDF per RFP → `POST /rfps/{rfp_id}/bids` → file saved under `data/uploads`, text extracted (PyMuPDF), `Bid` and audit event created.
3. **AI evaluation:** `POST /bids/{id}/evaluate` → backend sends extracted text (and optional RFP requirements) to Ollama (or mock) → score and reasoning stored; audit event recorded.
4. **Human review / Approver:** `PATCH /bids/{id}` (human score/notes), `PATCH /bids/{id}/status` (Approved/Rejected) → audit events recorded.
5. **Static files:** Uploaded PDFs served at `GET /static/{filename}` (backend mounts `data/uploads`).

---

## Backend Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app, lifespan (drop/create tables), CORS, static mount
│   ├── database.py          # SQLAlchemy engine, SessionLocal, get_db
│   ├── api/endpoints/
│   │   ├── admin.py         # POST /admin/reset — clear DB and uploads for demo
│   │   ├── rfps.py          # POST/GET /rfps, GET /rfps/{id}
│   │   └── bids.py          # Upload, list, get, evaluate, PATCH human/status
│   ├── models/
│   │   ├── base.py
│   │   ├── rfp.py           # RFP (title, description, requirements, budget, status)
│   │   ├── bid.py          # Bid (rfp_id, file_path, vendor_name, ai_*, human_*, status)
│   │   └── bid_audit.py    # BidAuditEvent (bid_id, action, actor, created_at)
│   ├── schemas/            # Pydantic request/response (rfp, bid)
│   └── services/
│       ├── file_service.py # save_uploaded_file, ensure_upload_dir
│       ├── ocr_service.py  # extract_text_from_pdf (PyMuPDF)
│       └── ai_service.py  # evaluate_bid (Ollama or mock)
├── Dockerfile
└── requirements.txt
```

- **Lifespan:** On startup, tables are dropped and recreated (POC convenience). Upload dir is ensured.
- **AI:** Prefers Ollama; falls back to mock if unavailable. Optional OpenAI via `OPENAI_API_KEY`.

---

## Frontend Structure

```
frontend/src/
├── app/
│   ├── layout.tsx, page.tsx        # Root layout, Dashboard (KPIs, charts, activity)
│   ├── rfps/
│   │   ├── page.tsx                # RFP list, Create RFP (templates), modal
│   │   └── [id]/page.tsx           # RFP detail, bid upload, bids table
│   └── bids/
│       ├── page.tsx                # All bids, upload form
│       └── [id]/page.tsx           # Bid detail: PDF viewer, AI eval, human review, approve/reject, audit trail
├── components/
│   ├── Layout.tsx                  # Dark sidebar nav, cream main area, RoleSwitcher
│   ├── Navbar.tsx, RoleSwitcher.tsx
├── contexts/
│   └── RoleContext.tsx             # Persona: Admin, Bid Manager, Reviewer, Auditor, Approver
└── lib/
    ├── api.ts                      # fetchRFPs, createRFP, uploadBid, evaluateBid, etc.
    ├── rfpTemplates.ts             # RFP templates (Load template in Create RFP)
    └── mockData.ts                 # Dashboard mock data (activity, etc.)
```

- **Layout:** Single shell with sidebar; Dashboard, RFPs, and Bids pages use consistent `p-8` padding.
- **Roles:** RoleSwitcher sets current persona; Create RFP and Approve/Reject are gated by Bid Manager and Approver.

---

## Database Schema (POC)

- **rfps:** id, title, description, requirements, budget, status, **bids_locked**, created_at, updated_at, closing_date
- **vendors:** id, name, address, website, domain, **website_verified**, created_at, updated_at
- **vendor_reps:** id, vendor_id, name, email, phone, designation, **phone_verified**, created_at
- **bids:** id, rfp_id, **vendor_id**, filename, file_path, extracted_text, vendor_name, status, ai_*, human_*, created_at, updated_at
- **bid_audit_events:** id, bid_id, action, actor, created_at
- **bid_evaluation_history:** id, bid_id, ai_score, ai_reasoning, human_score, human_notes, created_at (snapshot before re-evaluation)

---

## Key API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Health + ai_provider |
| POST | /admin/reset | Clear all data and uploads (demo reset) |
| POST | /rfps | Create RFP |
| GET | /rfps | List RFPs |
| GET | /rfps/{id} | Get RFP |
| **PATCH** | **/rfps/{id}/lock** | **Lock bids for final decision** |
| **GET** | **/rfps/{id}/comparative** | **Comparative analysis (bids past Uploaded)** |
| POST | /rfps/{id}/bids | Upload bid (PDF only; vendor extracted by AI) |
| GET | /rfps/{id}/bids | List bids for RFP |
| GET | /bids | List all bids |
| GET | /bids/{id} | Get bid (with vendor, audit_events, evaluation_history) |
| POST | /bids/{id}/evaluate | Run AI evaluation |
| **POST** | **/bids/{id}/re-evaluate** | **Re-evaluate with optional human_notes_context** |
| PATCH | /bids/{id} | Update human score/notes (rejected if locked/final) |
| PATCH | /bids/{id}/status | Set status Approved/Rejected |

---

## Running the Stack

```bash
docker-compose up
```

- **Frontend:** http://localhost:3000  
- **Backend:** http://localhost:8001 (health: `GET /health`)  
- **Postgres:** localhost:5432, user `shield_user`, db `shield_procure`  
- **Demo reset:** `curl -X POST http://localhost:8001/admin/reset`

Optional: run Ollama on the host for real AI evaluation; otherwise the backend uses a mock evaluator.
