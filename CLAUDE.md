# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Global Rules

### Exploration Rules
- Only read files that are explicitly requested or clearly relevant
- Always check existing file structure before creating new files
- Read only the necessary function/section, not the entire file

### Code Change Rules
- Minimize change scope — focus only on the requested feature
- Maintain consistency with existing patterns (naming, style, structure)
- Refactor only when explicitly requested
- If side effects are expected, explain them first and confirm before proceeding

### Response Rules
- Briefly summarize which files were changed and why
- Ask clarifying questions before writing code if requirements are unclear
- Omit unnecessary explanations, comments, and boilerplate
## What This Is

Location-based social discovery platform (Instagram/Xiaohongshu-style). Users post photos/videos tagged to real cities, browse a proximity-sorted feed, and filter by location. Korean-language UI strings.

## Development Commands

### Backend (FastAPI + PostgreSQL)

```bash
cd backend
.\venv\Scripts\Activate.ps1          # Windows (PowerShell)
# source venv/bin/activate            # macOS/Linux

python -m uvicorn main:app --host 0.0.0.0 --port 9000 --reload
```

Database init and seed (run once after creating the `platform_a` PostgreSQL database):

```bash
python init_db.py    # creates tables via SQLAlchemy metadata
python seed.py       # seeds test user (testuser / password123), sample location + post
```

Backend `.env` requires `DATABASE_URL` (asyncpg connection string).

### Frontend (React 19 + TypeScript + Vite)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc -b && vite build
npm run lint         # eslint
```

Optional: set `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env.local` for Google Maps. Without it, map panel shows a placeholder.

## Architecture

### Two-process stack

- **Frontend** (`:5173`): React SPA, calls backend API via `fetch`. API base URL configured in `frontend/src/config.ts` (defaults to `http://localhost:9000`).
- **Backend** (`:9000`): FastAPI, all routes in a single `backend/main.py`. Serves uploaded media as static files from `backend/uploads/`.

### Database layer

- Async PostgreSQL via SQLAlchemy async engine (`backend/database.py`). Connection string from `DATABASE_URL` env var.
- All models in `backend/models.py`: `User`, `Post`, `PostMedia`, `Location`, `SearchHistory`.
- `Post.image_url` is a legacy column — current media goes through the `PostMedia` join table (multi-file carousel support).
- `Location.coordinates` stores lat/lng as a comma-separated string (not PostGIS). `database/schema.sql` has a reference PostGIS schema but the ORM doesn't use it.

### Auth

- JWT bearer tokens (`backend/auth.py`). `python-jose` for encode/decode, `bcrypt` for password hashing.
- Two FastAPI dependencies: `require_user` (401 if missing) and `get_optional_user` (returns `None` for anonymous).
- Frontend stores auth in `localStorage` under key `discovery_auth`, exposed via React context (`AuthContext.tsx` / `useAuth` hook).

### Feed and ranking

- `/feed/` endpoint: fetches all posts, sorts in Python by haversine distance from user coords, then by search history recency. No database-level spatial query — all done in-memory.
- `/search/` endpoint: filters posts by exact `location_id`.
- Geocoding uses Nominatim (OpenStreetMap) — free, no API key. Called via `requests` wrapped in `asyncio.to_thread`.

### Frontend structure

- `App.tsx` is the main orchestrator: manages feed state, geolocation, and wires up all CRUD operations.
- Components: `PostCard` (carousel + inline edit/delete), `PostComposer` (create form), `MapPanel` (sidebar with location search), `LocationSearchInput` (shared city autocomplete), `Navbar`, `AuthModal`.
- No client-side routing — single-page with all content on one view.
