# Running Bid-Management with Docker

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed.

## Quick start

From the project root (`Bid-Management/`):

```bash
docker compose up --build
```

This will:

1. **PostgreSQL** – `db` on port **5432**
2. **Backend (FastAPI)** – `backend` on **http://localhost:8001**
3. **Frontend (Next.js)** – `frontend` on **http://localhost:3000**

- Open **http://localhost:3000** in your browser for the app.
- API base URL for the frontend is **http://localhost:8001** (set via `NEXT_PUBLIC_API_URL`).

## Optional: Ollama for AI evaluation

If you use Ollama for bid evaluation, run it on the host (not in Docker). The backend is configured to use `http://host.docker.internal:11434`. Start Ollama on your machine before using AI features.

## Data

- **Database**: Stored in a Docker volume `postgres_data`.
- **Uploaded PDFs**: Stored in `./data/uploads` on the host (mounted into the backend).

## Useful commands

```bash
# Run in background
docker compose up -d --build

# View logs
docker compose logs -f

# Stop
docker compose down

# Stop and remove database volume (resets DB)
docker compose down -v
```

## Database schema updates (existing deployments)

If you already have a database and add new columns (e.g. `bids.last_eval_duration_seconds`, `vendor_reps.email_verified`), run the following against your PostgreSQL instance, or reset the DB with `docker compose down -v` then `docker compose up` (which recreates tables from models).

```sql
ALTER TABLE bids ADD COLUMN IF NOT EXISTS last_eval_duration_seconds DOUBLE PRECISION;
ALTER TABLE vendor_reps ADD COLUMN IF NOT EXISTS email_verified BOOLEAN;
```

## Logs and debugging

**Backend logs (see what the API is doing):**
```bash
# All services
docker compose logs -f

# Backend only (recommended)
docker compose logs -f backend
```

**Check what the API returns for a bid:**  
Replace `1` with your bid id (e.g. from the URL when viewing a bid).
```bash
curl -s http://localhost:8001/bids/1 | python3 -m json.tool
```
Look for:
- `"vendor": { "name": "...", "address": ..., "website": ..., "representatives": [...] }` — if missing or `null`, vendor details won’t show.
- `"last_eval_duration_seconds": 12.34` — if missing or `null`, elapsed time won’t show after refresh.

**Browser:**  
Open DevTools (F12) → **Network** tab → reload the bid page → click the request to `bids/<id>` → **Response**. Check whether the JSON has `vendor` and `last_eval_duration_seconds`.

**What to send if it still fails:**  
1. Backend log lines that contain `get_bid` or `extract-vendor` or `evaluate` (from `docker compose logs backend`).  
2. The JSON output of `curl -s http://localhost:8001/bids/1` (or your bid id) so we can see the actual response.

## Rebuilding after dependency changes

If you change `backend/requirements.txt` or `frontend/package.json`:

```bash
docker compose build --no-cache
docker compose up
```

Or for a single service:

```bash
docker compose build --no-cache frontend
docker compose up
```
