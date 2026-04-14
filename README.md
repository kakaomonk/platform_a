# Discovery — Location-Based Social Platform

A location-based discovery platform inspired by Instagram/Xiaohongshu. Post photos and videos tagged to real cities, explore content by location.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Backend | FastAPI (Python) + SQLAlchemy (async) |
| Database | PostgreSQL |
| Maps | `@vis.gl/react-google-maps` (optional API key) |
| Geocoding | Nominatim (OpenStreetMap) — free, no key required |

## Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+

## Local Setup

### 1. Database

Create a PostgreSQL database:

```sql
CREATE DATABASE platform_a;
```

### 2. Backend

```bash
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1      # Windows
# source venv/bin/activate       # macOS/Linux

pip install fastapi uvicorn sqlalchemy asyncpg aiosqlite \
            python-multipart python-dotenv requests pydantic-settings
```

Create `backend/.env`:

```env
DATABASE_URL=postgresql+asyncpg://postgres:YOUR_PASSWORD@localhost:5432/platform_a
```

Initialize tables and seed data:

```bash
python init_db.py
python seed.py
```

Start the server:

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 9000 --reload
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

### Optional: Google Maps

Add to `frontend/.env.local`:

```env
VITE_GOOGLE_MAPS_API_KEY=your_key_here
```

Without this key the map panel shows a placeholder; all other features work normally.

---

## Features

### Posts
- **Create** — Write a post with text, photos, and/or videos
- **Multi-media carousel** — Upload multiple images/videos; swipe or use arrow buttons to navigate (touch swipe supported)
- **Edit** — Inline content editing with `⌘Enter` to save, `Esc` to cancel
- **Delete** — Inline confirmation before deletion

### Location
- **City search** — Type a city name to get real autocomplete results via Nominatim (only actual cities)
- **GPS detection** — Auto-detect current location with reverse geocoding
- **Location edit** — Change a post's tagged city after publishing

### Feed
- **Responsive grid** — Auto-fills columns based on available width (`auto-fill minmax(220px)`)
- **Location filter** — Side panel lets you filter the feed by city ID
- **Location display** — Each post card shows the tagged city below the media

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/upload/` | Upload one or more media files |
| `POST` | `/posts/` | Create a post |
| `PATCH` | `/posts/{id}` | Edit post content and/or location |
| `DELETE` | `/posts/{id}` | Delete a post |
| `GET` | `/search/?location_id=` | Fetch posts by location |
| `GET` | `/location/search/?q=` | City autocomplete (Nominatim) |
| `GET` | `/location/reverse-geocode/` | GPS coords → city name |
| `POST` | `/location/find-or-create/` | Find or insert a location record |

## Project Structure

```
platform_a/
├── backend/
│   ├── main.py          # FastAPI routes
│   ├── models.py        # SQLAlchemy models (Post, PostMedia, Location, User)
│   ├── database.py      # Async engine + session
│   ├── init_db.py       # Table creation
│   ├── seed.py          # Sample data
│   └── uploads/         # Uploaded media files
├── database/
│   └── schema.sql       # Reference PostgreSQL + PostGIS schema
└── frontend/
    └── src/
        ├── App.tsx
        ├── config.ts
        ├── types.ts
        └── components/
            ├── Navbar.tsx
            ├── PostCard.tsx          # Card with carousel + edit/delete
            ├── PostComposer.tsx      # Create post form
            ├── MapPanel.tsx          # Location filter sidebar
            └── LocationSearchInput.tsx  # Shared city search component
```
