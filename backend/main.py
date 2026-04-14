import asyncio
import os
import shutil
from typing import List, Optional
from uuid import uuid4

import requests as http_requests
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload, joinedload

from database import get_db
from models import Post, PostMedia, Location, User  # noqa: F401

app = FastAPI()

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".avi", ".mkv"}


# ── Upload ────────────────────────────────────────────────────────────────────

@app.post("/upload/")
async def upload_media(files: List[UploadFile] = File(...)):
    result = []
    for file in files:
        ext = os.path.splitext(file.filename or "")[1].lower()
        safe_name = f"{uuid4().hex}{ext}"
        dest = f"uploads/{safe_name}"
        with open(dest, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
        media_type = "video" if ext in VIDEO_EXTS else "image"
        result.append({"url": f"http://localhost:9000/{dest}", "media_type": media_type})
    return {"media": result}


# ── Location ──────────────────────────────────────────────────────────────────

def _nominatim_search_cities(q: str) -> list:
    """Nominatim structured city search — free, no API key, returns only city-level results."""
    resp = http_requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={
            "city": q,          # structured param → city-level only
            "format": "json",
            "addressdetails": 1,
            "limit": 6,
            "accept-language": "en",
            "dedupe": 1,
        },
        headers={"User-Agent": "platform_a/1.0 (local dev)"},
        timeout=6,
    )
    resp.raise_for_status()
    return resp.json()


def _nominatim_reverse(lat: float, lng: float) -> dict:
    resp = http_requests.get(
        "https://nominatim.openstreetmap.org/reverse",
        params={"lat": lat, "lon": lng, "format": "json"},
        headers={"User-Agent": "platform_a/1.0 (local dev)"},
        timeout=6,
    )
    resp.raise_for_status()
    return resp.json()


def _extract_nominatim_city(data: dict) -> str:
    addr = data.get("address", {})
    return (
        addr.get("city") or addr.get("town") or addr.get("village")
        or addr.get("county") or data.get("display_name", "Unknown")
    )


@app.get("/location/search/")
async def search_location(q: str):
    if len(q.strip()) < 2:
        return {"results": []}
    try:
        items = await asyncio.to_thread(_nominatim_search_cities, q)
        seen, results = set(), []
        for item in items:
            addr = item.get("address", {})
            # Nominatim city classification varies by country; item["name"] is most reliable
            name = (
                item.get("name")
                or addr.get("city") or addr.get("town")
                or addr.get("municipality") or addr.get("village")
                or addr.get("province") or addr.get("state")
            )
            if not name or name in seen:
                continue
            seen.add(name)
            country = addr.get("country", "")
            state = addr.get("state", "") if addr.get("state") != name else ""
            parts = [p for p in [name, state, country] if p]
            results.append({
                "name": name,
                "display_name": ", ".join(parts),
                "lat": float(item["lat"]),
                "lng": float(item["lon"]),
            })
        return {"results": results[:5]}
    except Exception:
        return {"results": []}


@app.get("/location/reverse-geocode/")
async def reverse_geocode(lat: float, lng: float, db: AsyncSession = Depends(get_db)):
    try:
        data = await asyncio.to_thread(_nominatim_reverse, lat, lng)
        name = _extract_nominatim_city(data)
    except Exception:
        name = f"{lat:.4f}, {lng:.4f}"
    return await _find_or_create_loc(name, lat, lng, db)


class LocationIn(BaseModel):
    name: str
    lat: float
    lng: float


@app.post("/location/find-or-create/")
async def find_or_create_location(payload: LocationIn, db: AsyncSession = Depends(get_db)):
    return await _find_or_create_loc(payload.name, payload.lat, payload.lng, db)


async def _find_or_create_loc(name: str, lat: float, lng: float, db: AsyncSession) -> dict:
    existing = await db.execute(
        select(Location).where(func.lower(Location.name) == name.lower())
    )
    loc = existing.scalars().first()
    if not loc:
        loc = Location(name=name, level="city", coordinates=f"{lat:.6f},{lng:.6f}")
        db.add(loc)
        await db.commit()
        await db.refresh(loc)
    return {"location_id": loc.id, "name": loc.name, "lat": lat, "lng": lng}


# ── Posts ─────────────────────────────────────────────────────────────────────

class MediaItemIn(BaseModel):
    url: str
    media_type: str = "image"


class PostCreate(BaseModel):
    user_id: int = 1
    content: str = ""
    location_id: int
    media: List[MediaItemIn] = []


class PostUpdate(BaseModel):
    content: Optional[str] = None
    location_id: Optional[int] = None


@app.post("/posts/")
async def create_post(payload: PostCreate, db: AsyncSession = Depends(get_db)):
    post = Post(user_id=payload.user_id, content=payload.content, location_id=payload.location_id)
    db.add(post)
    await db.flush()
    for i, item in enumerate(payload.media):
        db.add(PostMedia(post_id=post.id, media_url=item.url, media_type=item.media_type, order=i))
    await db.commit()
    return {"status": "success", "post_id": post.id}


@app.patch("/posts/{post_id}")
async def update_post(post_id: int, payload: PostUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if payload.content is not None:
        post.content = payload.content
    if payload.location_id is not None:
        post.location_id = payload.location_id

    await db.commit()

    loc_name = None
    if post.location_id:
        loc_result = await db.execute(select(Location).where(Location.id == post.location_id))
        loc = loc_result.scalar_one_or_none()
        loc_name = loc.name if loc else None

    return {"status": "success", "content": post.content, "location_name": loc_name}


@app.delete("/posts/{post_id}")
async def delete_post(post_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    await db.delete(post)
    await db.commit()
    return {"status": "success"}


@app.get("/search/")
async def search_posts(location_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Post)
        .where(Post.location_id == location_id)
        .options(selectinload(Post.media), joinedload(Post.location))
        .order_by(Post.created_at.desc())
    )
    posts = result.scalars().unique().all()

    def serialize(p: Post) -> dict:
        media = [{"url": m.media_url, "media_type": m.media_type} for m in p.media]
        if not media and p.image_url:
            media = [{"url": p.image_url, "media_type": "image"}]
        return {
            "id": p.id,
            "content": p.content,
            "user_id": p.user_id,
            "location_name": p.location.name if p.location else None,
            "media": media,
        }

    return {"location_id": location_id, "posts": [serialize(p) for p in posts]}
