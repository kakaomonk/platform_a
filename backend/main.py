import asyncio
import math
import os
import shutil
from typing import List, Optional
from uuid import uuid4

import requests as http_requests
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload, joinedload

from database import get_db
from models import Post, PostMedia, Location, User, SearchHistory  # noqa: F401
from auth import hash_password, verify_password, create_token, get_optional_user, require_user

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


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _parse_coords(coord_str: str):
    try:
        parts = coord_str.split(",")
        return float(parts[0].strip()), float(parts[1].strip())
    except (ValueError, IndexError, AttributeError):
        return None


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    username: str
    email: str
    password: str


class LoginIn(BaseModel):
    username: str
    password: str


@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterIn, db: AsyncSession = Depends(get_db)):
    username = payload.username.strip()
    email = payload.email.strip().lower()

    if len(username) < 2:
        raise HTTPException(status_code=422, detail="Username must be at least 2 characters")
    if len(payload.password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    existing = await db.execute(
        select(User).where(
            (func.lower(User.username) == username.lower()) |
            (func.lower(User.email) == email)
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="Username or email already taken")

    user = User(username=username, email=email, password_hash=hash_password(payload.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {"token": create_token(user.id, user.username), "user_id": user.id, "username": user.username}


@app.post("/auth/login")
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(func.lower(User.username) == payload.username.strip().lower())
    )
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다")
    return {"token": create_token(user.id, user.username), "user_id": user.id, "username": user.username}


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
    resp = http_requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={
            "city": q,
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
    content: str = ""
    location_id: int
    media: List[MediaItemIn] = []


class PostUpdate(BaseModel):
    content: Optional[str] = None
    location_id: Optional[int] = None


@app.post("/posts/", status_code=status.HTTP_201_CREATED)
async def create_post(
    payload: PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    post = Post(user_id=current_user.id, content=payload.content, location_id=payload.location_id)
    db.add(post)
    await db.flush()
    for i, item in enumerate(payload.media):
        db.add(PostMedia(post_id=post.id, media_url=item.url, media_type=item.media_type, order=i))
    await db.commit()
    return {"status": "success", "post_id": post.id}


@app.patch("/posts/{post_id}")
async def update_post(
    post_id: int,
    payload: PostUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

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
async def delete_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.delete(post)
    await db.commit()
    return {"status": "success"}


@app.get("/search/")
async def search_posts(location_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Post)
        .where(Post.location_id == location_id)
        .options(
            selectinload(Post.media),
            joinedload(Post.location),
            joinedload(Post.user),
        )
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
            "username": p.user.username if p.user else f"user_{p.user_id}",
            "location_name": p.location.name if p.location else None,
            "media": media,
        }

    return {"location_id": location_id, "posts": [serialize(p) for p in posts]}


# ── Proximity Feed ───────────────────────────────────────────────────────────

@app.get("/feed/")
async def proximity_feed(
    lat: float,
    lng: float,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    result = await db.execute(
        select(Post)
        .options(selectinload(Post.media), joinedload(Post.location), joinedload(Post.user))
    )
    posts = result.scalars().unique().all()

    recent_loc_ids: list[int] = []
    if current_user:
        hist = await db.execute(
            select(SearchHistory.location_id)
            .where(SearchHistory.user_id == current_user.id)
            .order_by(SearchHistory.searched_at.desc())
            .limit(50)
        )
        seen: set[int] = set()
        for (loc_id,) in hist.all():
            if loc_id not in seen:
                recent_loc_ids.append(loc_id)
                seen.add(loc_id)

    max_rank = len(recent_loc_ids)

    def sort_key(p: Post):
        dist = float("inf")
        if p.location and p.location.coordinates:
            coords = _parse_coords(p.location.coordinates)
            if coords:
                dist = _haversine(lat, lng, coords[0], coords[1])
        search_rank = max_rank
        if p.location_id and p.location_id in recent_loc_ids:
            search_rank = recent_loc_ids.index(p.location_id)
        return (dist, search_rank, -(p.id or 0))

    posts_sorted = sorted(posts, key=sort_key)

    def serialize(p: Post) -> dict:
        media = [{"url": m.media_url, "media_type": m.media_type} for m in p.media]
        if not media and p.image_url:
            media = [{"url": p.image_url, "media_type": "image"}]
        dist_km = None
        if p.location and p.location.coordinates:
            coords = _parse_coords(p.location.coordinates)
            if coords:
                dist_km = round(_haversine(lat, lng, coords[0], coords[1]), 1)
        return {
            "id": p.id,
            "content": p.content,
            "user_id": p.user_id,
            "username": p.user.username if p.user else f"user_{p.user_id}",
            "location_name": p.location.name if p.location else None,
            "location_id": p.location_id,
            "distance_km": dist_km,
            "media": media,
        }

    return {"posts": [serialize(p) for p in posts_sorted]}


# ── Search History ───────────────────────────────────────────────────────────

class SearchHistoryIn(BaseModel):
    location_id: int
    query_text: str = ""


@app.post("/search-history/")
async def record_search_history(
    payload: SearchHistoryIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    entry = SearchHistory(
        user_id=current_user.id,
        location_id=payload.location_id,
        query_text=payload.query_text,
    )
    db.add(entry)
    await db.commit()
    return {"status": "ok"}
