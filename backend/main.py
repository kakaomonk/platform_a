import asyncio
import math
import os
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

import requests as http_requests
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload, joinedload, contains_eager

from database import get_db
from models import Post, PostMedia, Location, User, SearchHistory, Like, Bookmark, Comment, Follow, Conversation, DirectMessage, Notification  # noqa: F401
from auth import hash_password, verify_password, create_token, get_optional_user, require_user
from storage import save_file, delete_file

app = FastAPI()

BASE_URL = os.getenv("BASE_URL", "http://localhost:9000")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]

if not os.getenv("S3_BUCKET"):
    os.makedirs("uploads", exist_ok=True)
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"https?://localhost:\d+/?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".avi", ".mkv"}

MENTION_RE = re.compile(r"@([A-Za-z0-9_]{2,32})")


@app.get("/")
async def root():
    return {"status": "ok", "service": "platform_a"}


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Notification helpers ─────────────────────────────────────────────────────

def _add_notification(
    db: AsyncSession,
    *,
    user_id: int,
    actor_id: int,
    type: str,
    post_id: Optional[int] = None,
    comment_id: Optional[int] = None,
) -> None:
    """Enqueue a notification row if not self-triggered. Caller must commit."""
    if user_id == actor_id:
        return
    db.add(Notification(
        user_id=user_id,
        actor_id=actor_id,
        type=type,
        post_id=post_id,
        comment_id=comment_id,
    ))


async def _notify_mentions(
    db: AsyncSession,
    content: str,
    actor_id: int,
    notif_type: str,
    *,
    post_id: Optional[int] = None,
    comment_id: Optional[int] = None,
    skip_user_ids: Optional[set] = None,
) -> None:
    """Extract @usernames from content, resolve to users, create notifications."""
    usernames = {m.lower() for m in MENTION_RE.findall(content or "")}
    if not usernames:
        return
    skip = skip_user_ids or set()
    result = await db.execute(
        select(User).where(func.lower(User.username).in_(usernames))
    )
    for u in result.scalars().all():
        if u.id == actor_id or u.id in skip:
            continue
        db.add(Notification(
            user_id=u.id,
            actor_id=actor_id,
            type=notif_type,
            post_id=post_id,
            comment_id=comment_id,
        ))


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
        media_type = "video" if ext in VIDEO_EXTS else "image"
        url = save_file(file.file, safe_name, file.content_type or "application/octet-stream")
        result.append({"url": url, "media_type": media_type})
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
        loc = Location(name=name, level="city", coordinates=f"{lat:.6f},{lng:.6f}",
                       latitude=lat, longitude=lng)
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
    category: Optional[str] = None
    is_marketplace: bool = False
    listing_type: Optional[str] = None  # "sell" | "buy"
    price: Optional[int] = None
    currency: Optional[str] = "KRW"


class PostUpdate(BaseModel):
    content: Optional[str] = None
    location_id: Optional[int] = None
    category: Optional[str] = None
    listing_type: Optional[str] = None
    price: Optional[int] = None
    sold: Optional[bool] = None


@app.post("/posts/", status_code=status.HTTP_201_CREATED)
async def create_post(
    payload: PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    price = payload.price if payload.is_marketplace else None
    if price is not None and price < 0:
        raise HTTPException(status_code=422, detail="Price must be non-negative")
    listing_type: Optional[str] = None
    if payload.is_marketplace:
        lt = (payload.listing_type or "sell").lower()
        if lt not in ("sell", "buy"):
            raise HTTPException(status_code=422, detail="listing_type must be 'sell' or 'buy'")
        listing_type = lt
    post = Post(
        user_id=current_user.id,
        content=payload.content,
        location_id=payload.location_id,
        category=payload.category,
        is_marketplace=payload.is_marketplace,
        listing_type=listing_type,
        price=price,
        currency=(payload.currency or "KRW") if payload.is_marketplace else None,
    )
    db.add(post)
    await db.flush()
    for i, item in enumerate(payload.media):
        db.add(PostMedia(post_id=post.id, media_url=item.url, media_type=item.media_type, order=i))
    await _notify_mentions(db, payload.content, current_user.id, "mention_post", post_id=post.id)
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

    new_category = post.category  # default: unchanged
    if payload.category is not None:
        new_category = payload.category if payload.category != "" else None

    if payload.content is not None:
        post.content = payload.content
    if payload.location_id is not None:
        post.location_id = payload.location_id
    if payload.category is not None:
        post.category = new_category
    if payload.price is not None and post.is_marketplace:
        if payload.price < 0:
            raise HTTPException(status_code=422, detail="Price must be non-negative")
        post.price = payload.price
    if payload.sold is not None and post.is_marketplace:
        post.sold = payload.sold
    if payload.listing_type is not None and post.is_marketplace:
        lt = payload.listing_type.lower()
        if lt not in ("sell", "buy"):
            raise HTTPException(status_code=422, detail="listing_type must be 'sell' or 'buy'")
        post.listing_type = lt
    await db.commit()
    await db.refresh(post)

    result2 = await db.execute(
        select(Post).where(Post.id == post_id).options(joinedload(Post.location))
    )
    post = result2.scalar_one()
    loc_name = post.location.name if post.location else None

    return {
        "status": "success",
        "content": post.content,
        "location_name": loc_name,
        "category": post.category,
        "listing_type": post.listing_type,
        "price": post.price,
        "sold": post.sold,
    }


@app.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(
        select(Post).where(Post.id == post_id).options(selectinload(Post.media))
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Clean up uploaded files from disk
    for m in post.media:
        local = m.media_url.replace(f"{BASE_URL}/", "")
        if os.path.isfile(local):
            os.remove(local)

    await db.delete(post)
    await db.commit()
    return {"status": "success"}


@app.get("/search/")
async def search_posts(
    location_id: int,
    limit: int = 20,
    offset: int = 0,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    limit = min(limit, 50)
    q = select(Post).where(Post.location_id == location_id, Post.is_marketplace.is_(False))
    if category:
        q = q.where(Post.category == category)
    q = q.options(
        selectinload(Post.media),
        joinedload(Post.location),
        joinedload(Post.user),
    ).order_by(Post.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(q)
    posts = result.scalars().unique().all()

    like_set = await _user_like_set(db, current_user, [p.id for p in posts])
    bookmark_set = await _user_bookmark_set(db, current_user, [p.id for p in posts])
    like_counts = await _like_counts(db, [p.id for p in posts])
    comment_counts = await _comment_counts(db, [p.id for p in posts])

    def serialize(p: Post) -> dict:
        media = [{"url": m.media_url, "media_type": m.media_type} for m in p.media]
        if not media and p.image_url:
            media = [{"url": p.image_url, "media_type": "image"}]
        return {
            "id": p.id,
            "content": p.content,
            "user_id": p.user_id,
            "username": p.user.username if p.user else f"user_{p.user_id}",
            "avatar_url": p.user.avatar_url if p.user else None,
            "location_name": p.location.name if p.location else None,
            "category": p.category,
            "media": media,
            "like_count": like_counts.get(p.id, 0),
            "comment_count": comment_counts.get(p.id, 0),
            "is_liked": p.id in like_set,
            "is_bookmarked": p.id in bookmark_set,
            "is_marketplace": bool(p.is_marketplace),
            "listing_type": p.listing_type,
            "price": p.price,
            "currency": p.currency,
            "sold": bool(p.sold),
        }

    return {"location_id": location_id, "posts": [serialize(p) for p in posts]}


@app.get("/search/posts/")
async def text_search_posts(
    q: str,
    lat: float,
    lng: float,
    limit: int = 20,
    offset: int = 0,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    q = q.strip()
    if not q:
        return {"posts": [], "total": 0, "query": q}
    limit = min(limit, 50)

    filters = [
        Post.is_marketplace.is_(False),
        or_(Post.content.ilike(f"%{q}%"), Location.name.ilike(f"%{q}%")),
    ]
    if category:
        filters.append(Post.category == category)

    result = await db.execute(
        select(Post)
        .outerjoin(Post.location)
        .where(*filters)
        .options(
            selectinload(Post.media),
            contains_eager(Post.location),
            joinedload(Post.user),
        )
    )
    posts = result.scalars().unique().all()

    q_lower = q.lower()

    def sort_key(p: Post):
        content_match = q_lower in (p.content or "").lower()
        loc_match = q_lower in (p.location.name if p.location else "").lower()
        relevance = 2 if (content_match and loc_match) else (1 if content_match else 0)
        dist = float("inf")
        if p.location and p.location.coordinates:
            c = _parse_coords(p.location.coordinates)
            if c:
                dist = _haversine(lat, lng, c[0], c[1])
        return (-relevance, dist, -(p.id or 0))

    posts_sorted = sorted(posts, key=sort_key)
    total = len(posts_sorted)
    page = posts_sorted[offset:offset + limit]

    like_set = await _user_like_set(db, current_user, [p.id for p in page])
    bookmark_set = await _user_bookmark_set(db, current_user, [p.id for p in page])
    like_counts = await _like_counts(db, [p.id for p in page])
    comment_counts = await _comment_counts(db, [p.id for p in page])

    def serialize(p: Post) -> dict:
        media = [{"url": m.media_url, "media_type": m.media_type} for m in p.media]
        if not media and p.image_url:
            media = [{"url": p.image_url, "media_type": "image"}]
        dist_km = None
        if p.location and p.location.coordinates:
            c = _parse_coords(p.location.coordinates)
            if c:
                dist_km = round(_haversine(lat, lng, c[0], c[1]), 1)
        return {
            "id": p.id,
            "content": p.content,
            "user_id": p.user_id,
            "username": p.user.username if p.user else f"user_{p.user_id}",
            "avatar_url": p.user.avatar_url if p.user else None,
            "location_name": p.location.name if p.location else None,
            "location_id": p.location_id,
            "distance_km": dist_km,
            "category": p.category,
            "media": media,
            "like_count": like_counts.get(p.id, 0),
            "comment_count": comment_counts.get(p.id, 0),
            "is_liked": p.id in like_set,
            "is_bookmarked": p.id in bookmark_set,
            "is_marketplace": bool(p.is_marketplace),
            "listing_type": p.listing_type,
            "price": p.price,
            "currency": p.currency,
            "sold": bool(p.sold),
        }

    return {"posts": [serialize(p) for p in page], "total": total, "query": q}


@app.get("/search/nearby-cities/")
async def nearby_cities(
    lat: float,
    lng: float,
    exclude_id: Optional[int] = None,
    limit: int = 6,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Location, func.count(Post.id).label("post_count"))
        .join(Post, Post.location_id == Location.id)
        .group_by(Location.id)
        .having(func.count(Post.id) > 0)
    )
    rows = result.all()

    cities = []
    for loc, count in rows:
        if exclude_id and loc.id == exclude_id:
            continue
        if not loc.coordinates:
            continue
        c = _parse_coords(loc.coordinates)
        if not c:
            continue
        dist = _haversine(lat, lng, c[0], c[1])
        cities.append({
            "id": loc.id,
            "name": loc.name,
            "post_count": count,
            "distance_km": round(dist, 1),
            "lat": c[0],
            "lng": c[1],
        })

    cities.sort(key=lambda x: x["distance_km"])
    return {"cities": cities[:limit]}


# ── Proximity Feed ───────────────────────────────────────────────────────────

@app.get("/feed/")
async def proximity_feed(
    lat: float,
    lng: float,
    limit: int = 20,
    offset: int = 0,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    limit = min(limit, 50)
    # ~5,000 km bounding box — shrinks the fetch set before Python distance sort
    LAT_DELTA = 45.0
    lng_delta = min(90.0, LAT_DELTA / max(math.cos(math.radians(lat)), 0.017))
    feed_q = (
        select(Post)
        .join(Post.location)
        .where(
            Post.is_marketplace.is_(False),
            or_(
                Location.latitude.is_(None),
                and_(
                    Location.latitude.between(lat - LAT_DELTA, lat + LAT_DELTA),
                    Location.longitude.between(lng - lng_delta, lng + lng_delta),
                ),
            ),
        )
        .options(selectinload(Post.media), contains_eager(Post.location), joinedload(Post.user))
    )
    if category:
        feed_q = feed_q.where(Post.category == category)
    result = await db.execute(feed_q)
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
    page = posts_sorted[offset:offset + limit]

    like_set = await _user_like_set(db, current_user, [p.id for p in page])
    bookmark_set = await _user_bookmark_set(db, current_user, [p.id for p in page])
    like_counts = await _like_counts(db, [p.id for p in page])
    comment_counts = await _comment_counts(db, [p.id for p in page])

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
            "avatar_url": p.user.avatar_url if p.user else None,
            "location_name": p.location.name if p.location else None,
            "location_id": p.location_id,
            "distance_km": dist_km,
            "category": p.category,
            "media": media,
            "like_count": like_counts.get(p.id, 0),
            "comment_count": comment_counts.get(p.id, 0),
            "is_liked": p.id in like_set,
            "is_bookmarked": p.id in bookmark_set,
            "is_marketplace": bool(p.is_marketplace),
            "listing_type": p.listing_type,
            "price": p.price,
            "currency": p.currency,
            "sold": bool(p.sold),
        }

    return {"posts": [serialize(p) for p in page], "total": len(posts_sorted)}


# ── Like/Comment helpers ─────────────────────────────────────────────────────

async def _user_like_set(db: AsyncSession, user: Optional[User], post_ids: list[int]) -> set[int]:
    if not user or not post_ids:
        return set()
    result = await db.execute(
        select(Like.post_id).where(Like.user_id == user.id, Like.post_id.in_(post_ids))
    )
    return {row[0] for row in result.all()}


async def _user_bookmark_set(db: AsyncSession, user: Optional[User], post_ids: list[int]) -> set[int]:
    if not user or not post_ids:
        return set()
    result = await db.execute(
        select(Bookmark.post_id).where(Bookmark.user_id == user.id, Bookmark.post_id.in_(post_ids))
    )
    return {row[0] for row in result.all()}


async def _like_counts(db: AsyncSession, post_ids: list[int]) -> dict[int, int]:
    if not post_ids:
        return {}
    result = await db.execute(
        select(Like.post_id, func.count(Like.id))
        .where(Like.post_id.in_(post_ids))
        .group_by(Like.post_id)
    )
    return dict(result.all())


async def _comment_counts(db: AsyncSession, post_ids: list[int]) -> dict[int, int]:
    if not post_ids:
        return {}
    result = await db.execute(
        select(Comment.post_id, func.count(Comment.id))
        .where(Comment.post_id.in_(post_ids))
        .group_by(Comment.post_id)
    )
    return dict(result.all())


# ── Likes ────────────────────────────────────────────────────────────────────

@app.post("/posts/{post_id}/like", status_code=status.HTTP_201_CREATED)
async def like_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    existing = await db.execute(
        select(Like).where(Like.user_id == current_user.id, Like.post_id == post_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already liked")
    db.add(Like(user_id=current_user.id, post_id=post_id))

    post_res = await db.execute(select(Post.user_id).where(Post.id == post_id))
    owner_id = post_res.scalar_one_or_none()
    if owner_id is not None:
        _add_notification(db, user_id=owner_id, actor_id=current_user.id, type="like", post_id=post_id)

    await db.commit()
    count = await db.execute(select(func.count(Like.id)).where(Like.post_id == post_id))
    return {"status": "liked", "like_count": count.scalar()}


@app.post("/posts/{post_id}/bookmark", status_code=status.HTTP_201_CREATED)
async def bookmark_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    exists = await db.execute(select(Post.id).where(Post.id == post_id))
    if not exists.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Post not found")
    existing = await db.execute(
        select(Bookmark).where(Bookmark.user_id == current_user.id, Bookmark.post_id == post_id)
    )
    if existing.scalar_one_or_none():
        return {"status": "bookmarked"}
    db.add(Bookmark(user_id=current_user.id, post_id=post_id))
    await db.commit()
    return {"status": "bookmarked"}


@app.delete("/posts/{post_id}/bookmark")
async def unbookmark_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(
        select(Bookmark).where(Bookmark.user_id == current_user.id, Bookmark.post_id == post_id)
    )
    bookmark = result.scalar_one_or_none()
    if not bookmark:
        return {"status": "unbookmarked"}
    await db.delete(bookmark)
    await db.commit()
    return {"status": "unbookmarked"}


@app.delete("/posts/{post_id}/like")
async def unlike_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(
        select(Like).where(Like.user_id == current_user.id, Like.post_id == post_id)
    )
    like = result.scalar_one_or_none()
    if not like:
        raise HTTPException(status_code=404, detail="Not liked")
    await db.delete(like)
    # Remove any unread like notification from this actor for this post
    await db.execute(
        Notification.__table__.delete().where(
            Notification.actor_id == current_user.id,
            Notification.post_id == post_id,
            Notification.type == "like",
            Notification.is_read.is_(False),
        )
    )
    await db.commit()
    count = await db.execute(select(func.count(Like.id)).where(Like.post_id == post_id))
    return {"status": "unliked", "like_count": count.scalar()}


# ── Comments ─────────────────────────────────────────────────────────────────

class CommentIn(BaseModel):
    content: str


@app.get("/posts/{post_id}/comments")
async def get_comments(post_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Comment)
        .where(Comment.post_id == post_id)
        .options(joinedload(Comment.user))
        .order_by(Comment.created_at.asc())
    )
    comments = result.scalars().unique().all()
    return {
        "comments": [
            {
                "id": c.id,
                "user_id": c.user_id,
                "username": c.user.username if c.user else f"user_{c.user_id}",
                "avatar_url": c.user.avatar_url if c.user else None,
                "content": c.content,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in comments
        ]
    }


@app.post("/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED)
async def create_comment(
    post_id: int,
    payload: CommentIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if not payload.content.strip():
        raise HTTPException(status_code=422, detail="Comment cannot be empty")
    content = payload.content.strip()
    comment = Comment(user_id=current_user.id, post_id=post_id, content=content)
    db.add(comment)
    await db.flush()

    post_res = await db.execute(select(Post.user_id).where(Post.id == post_id))
    owner_id = post_res.scalar_one_or_none()
    skip_ids = {current_user.id}
    if owner_id is not None:
        _add_notification(db, user_id=owner_id, actor_id=current_user.id, type="comment",
                          post_id=post_id, comment_id=comment.id)
        skip_ids.add(owner_id)

    await _notify_mentions(
        db, content, current_user.id, "mention_comment",
        post_id=post_id, comment_id=comment.id, skip_user_ids=skip_ids,
    )

    await db.commit()
    await db.refresh(comment)
    return {
        "id": comment.id,
        "user_id": current_user.id,
        "username": current_user.username,
        "avatar_url": current_user.avatar_url,
        "content": comment.content,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
    }


@app.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    await db.delete(comment)
    await db.commit()
    return {"status": "success"}


# ── User Profile ─────────────────────────────────────────────────────────────

@app.get("/users/{user_id}")
async def get_user_profile(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    post_count = await db.execute(select(func.count(Post.id)).where(Post.user_id == user_id))
    follower_count = await db.execute(select(func.count(Follow.id)).where(Follow.following_id == user_id))
    following_count = await db.execute(select(func.count(Follow.id)).where(Follow.follower_id == user_id))
    is_following = False
    if current_user and current_user.id != user_id:
        chk = await db.execute(
            select(Follow).where(Follow.follower_id == current_user.id, Follow.following_id == user_id)
        )
        is_following = chk.scalar_one_or_none() is not None
    return {
        "id": user.id,
        "username": user.username,
        "avatar_url": user.avatar_url,
        "bio": user.bio,
        "post_count": post_count.scalar(),
        "follower_count": follower_count.scalar(),
        "following_count": following_count.scalar(),
        "is_following": is_following,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


class ProfileUpdate(BaseModel):
    bio: Optional[str] = None


@app.patch("/users/me")
async def update_profile(
    payload: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if payload.bio is not None:
        current_user.bio = payload.bio[:300]
    await db.commit()
    return {
        "id": current_user.id,
        "username": current_user.username,
        "avatar_url": current_user.avatar_url,
        "bio": current_user.bio,
    }


@app.post("/users/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        raise HTTPException(status_code=422, detail="이미지 파일만 업로드 가능합니다")
    safe_name = f"avatar_{current_user.id}_{uuid4().hex[:8]}{ext}"
    delete_file(current_user.avatar_url)
    url = save_file(file.file, safe_name, file.content_type or "image/jpeg")
    current_user.avatar_url = url
    await db.commit()
    return {"avatar_url": current_user.avatar_url}


# ── Follow ───────────────────────────────────────────────────────────────────

@app.post("/users/{user_id}/follow", status_code=status.HTTP_201_CREATED)
async def follow_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="자기 자신을 팔로우할 수 없습니다")
    target = await db.execute(select(User).where(User.id == user_id))
    if not target.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")
    existing = await db.execute(
        select(Follow).where(Follow.follower_id == current_user.id, Follow.following_id == user_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already following")
    db.add(Follow(follower_id=current_user.id, following_id=user_id))
    _add_notification(db, user_id=user_id, actor_id=current_user.id, type="follow")
    await db.commit()
    count = await db.execute(select(func.count(Follow.id)).where(Follow.following_id == user_id))
    return {"status": "following", "follower_count": count.scalar()}


@app.delete("/users/{user_id}/follow")
async def unfollow_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(
        select(Follow).where(Follow.follower_id == current_user.id, Follow.following_id == user_id)
    )
    follow = result.scalar_one_or_none()
    if not follow:
        raise HTTPException(status_code=404, detail="Not following")
    await db.delete(follow)
    await db.execute(
        Notification.__table__.delete().where(
            Notification.actor_id == current_user.id,
            Notification.user_id == user_id,
            Notification.type == "follow",
            Notification.is_read.is_(False),
        )
    )
    await db.commit()
    count = await db.execute(select(func.count(Follow.id)).where(Follow.following_id == user_id))
    return {"status": "unfollowed", "follower_count": count.scalar()}


@app.get("/feed/following")
async def following_feed(
    limit: int = 20,
    offset: int = 0,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    limit = min(limit, 50)
    following_res = await db.execute(
        select(Follow.following_id).where(Follow.follower_id == current_user.id)
    )
    following_ids = [row[0] for row in following_res.all()]

    if not following_ids:
        return {"posts": [], "total": 0}

    where_clauses = [Post.user_id.in_(following_ids), Post.is_marketplace.is_(False)]
    if category:
        where_clauses.append(Post.category == category)

    total_res = await db.execute(
        select(func.count(Post.id)).where(*where_clauses)
    )
    total = total_res.scalar()

    result = await db.execute(
        select(Post)
        .where(*where_clauses)
        .options(selectinload(Post.media), joinedload(Post.location), joinedload(Post.user))
        .order_by(Post.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    posts = result.scalars().unique().all()

    like_set = await _user_like_set(db, current_user, [p.id for p in posts])
    bookmark_set = await _user_bookmark_set(db, current_user, [p.id for p in posts])
    like_counts = await _like_counts(db, [p.id for p in posts])
    comment_counts = await _comment_counts(db, [p.id for p in posts])

    def serialize(p: Post) -> dict:
        media = [{"url": m.media_url, "media_type": m.media_type} for m in p.media]
        if not media and p.image_url:
            media = [{"url": p.image_url, "media_type": "image"}]
        return {
            "id": p.id,
            "content": p.content,
            "user_id": p.user_id,
            "username": p.user.username if p.user else f"user_{p.user_id}",
            "avatar_url": p.user.avatar_url if p.user else None,
            "location_name": p.location.name if p.location else None,
            "location_id": p.location_id,
            "distance_km": None,
            "category": p.category,
            "media": media,
            "like_count": like_counts.get(p.id, 0),
            "comment_count": comment_counts.get(p.id, 0),
            "is_liked": p.id in like_set,
            "is_bookmarked": p.id in bookmark_set,
            "is_marketplace": bool(p.is_marketplace),
            "listing_type": p.listing_type,
            "price": p.price,
            "currency": p.currency,
            "sold": bool(p.sold),
        }

    return {"posts": [serialize(p) for p in posts], "total": total}


# ── User Search (for @mentions) ──────────────────────────────────────────────

@app.get("/users/search/")
async def search_users(
    q: str,
    limit: int = 8,
    db: AsyncSession = Depends(get_db),
):
    q = q.strip()
    if len(q) < 1:
        return {"users": []}
    result = await db.execute(
        select(User)
        .where(User.username.ilike(f"%{q}%"))
        .order_by(User.username.asc())
        .limit(limit)
    )
    users = result.scalars().all()
    return {
        "users": [
            {"id": u.id, "username": u.username, "avatar_url": u.avatar_url}
            for u in users
        ]
    }


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


# ── DM ────────────────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    target_user_id: int


class DMMessageIn(BaseModel):
    content: str


async def _get_conversation(conv_id: int, user_id: int, db: AsyncSession) -> Conversation:
    result = await db.execute(select(Conversation).where(Conversation.id == conv_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.user1_id != user_id and conv.user2_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return conv


@app.post("/dm/conversations/", status_code=status.HTTP_201_CREATED)
async def get_or_create_conversation(
    payload: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if payload.target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="자기 자신에게 DM을 보낼 수 없습니다")
    target = await db.execute(select(User).where(User.id == payload.target_user_id))
    if not target.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    u1, u2 = min(current_user.id, payload.target_user_id), max(current_user.id, payload.target_user_id)
    result = await db.execute(
        select(Conversation).where(Conversation.user1_id == u1, Conversation.user2_id == u2)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        conv = Conversation(user1_id=u1, user2_id=u2)
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
    return {"id": conv.id}


@app.get("/dm/conversations/")
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(
        select(Conversation)
        .where(
            (Conversation.user1_id == current_user.id) |
            (Conversation.user2_id == current_user.id)
        )
        .options(joinedload(Conversation.user1), joinedload(Conversation.user2))
        .order_by(Conversation.updated_at.desc())
    )
    convs = result.scalars().unique().all()

    conv_ids = [c.id for c in convs]
    if not conv_ids:
        return {"conversations": []}

    unread_result = await db.execute(
        select(DirectMessage.conversation_id, func.count(DirectMessage.id))
        .where(
            DirectMessage.conversation_id.in_(conv_ids),
            DirectMessage.sender_id != current_user.id,
            DirectMessage.is_read.is_(False),
        )
        .group_by(DirectMessage.conversation_id)
    )
    unread_map = dict(unread_result.all())

    last_msg_result = await db.execute(
        select(DirectMessage)
        .where(DirectMessage.conversation_id.in_(conv_ids))
        .order_by(DirectMessage.created_at.desc())
    )
    all_msgs = last_msg_result.scalars().all()
    last_msg_map: dict[int, DirectMessage] = {}
    for msg in all_msgs:
        if msg.conversation_id not in last_msg_map:
            last_msg_map[msg.conversation_id] = msg

    output = []
    for c in convs:
        other = c.user2 if c.user1_id == current_user.id else c.user1
        last = last_msg_map.get(c.id)
        output.append({
            "id": c.id,
            "other_user": {
                "id": other.id,
                "username": other.username,
                "avatar_url": other.avatar_url,
            },
            "last_message": last.content[:80] if last else None,
            "last_message_at": last.created_at.isoformat() if last and last.created_at else None,
            "unread_count": unread_map.get(c.id, 0),
        })

    return {"conversations": output}


@app.get("/dm/conversations/{conv_id}/messages")
async def get_messages(
    conv_id: int,
    limit: int = 50,
    before_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await _get_conversation(conv_id, current_user.id, db)

    q = select(DirectMessage).where(DirectMessage.conversation_id == conv_id)
    if before_id:
        q = q.where(DirectMessage.id < before_id)
    q = q.order_by(DirectMessage.created_at.asc()).limit(limit)

    result = await db.execute(q)
    msgs = result.scalars().all()

    for m in msgs:
        if m.sender_id != current_user.id and not m.is_read:
            m.is_read = True
    await db.commit()

    return {
        "messages": [
            {
                "id": m.id,
                "sender_id": m.sender_id,
                "content": m.content,
                "is_read": m.is_read,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in msgs
        ]
    }


@app.post("/dm/conversations/{conv_id}/messages", status_code=status.HTTP_201_CREATED)
async def send_message(
    conv_id: int,
    payload: DMMessageIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if not payload.content.strip():
        raise HTTPException(status_code=422, detail="메시지가 비어 있습니다")
    conv = await _get_conversation(conv_id, current_user.id, db)

    msg = DirectMessage(
        conversation_id=conv_id,
        sender_id=current_user.id,
        content=payload.content.strip(),
    )
    db.add(msg)
    conv.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(msg)

    return {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "content": msg.content,
        "is_read": msg.is_read,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


@app.get("/dm/unread-count")
async def unread_dm_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    conv_result = await db.execute(
        select(Conversation.id).where(
            (Conversation.user1_id == current_user.id) |
            (Conversation.user2_id == current_user.id)
        )
    )
    conv_ids = [row[0] for row in conv_result.all()]
    if not conv_ids:
        return {"unread_count": 0}

    result = await db.execute(
        select(func.count(DirectMessage.id)).where(
            DirectMessage.conversation_id.in_(conv_ids),
            DirectMessage.sender_id != current_user.id,
            DirectMessage.is_read.is_(False),
        )
    )
    return {"unread_count": result.scalar() or 0}


# ── Marketplace ──────────────────────────────────────────────────────────────

@app.get("/marketplace/")
async def marketplace_feed(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    limit: int = 30,
    offset: int = 0,
    category: Optional[str] = None,
    include_sold: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    limit = min(max(limit, 1), 60)

    filters = [Post.is_marketplace.is_(True)]
    if not include_sold:
        filters.append(Post.sold.is_(False))
    if category:
        filters.append(Post.category == category)

    total_res = await db.execute(select(func.count(Post.id)).where(*filters))
    total = total_res.scalar() or 0

    result = await db.execute(
        select(Post)
        .where(*filters)
        .options(selectinload(Post.media), joinedload(Post.location), joinedload(Post.user))
        .order_by(Post.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    posts = result.scalars().unique().all()

    like_set = await _user_like_set(db, current_user, [p.id for p in posts])
    bookmark_set = await _user_bookmark_set(db, current_user, [p.id for p in posts])
    like_counts = await _like_counts(db, [p.id for p in posts])
    comment_counts = await _comment_counts(db, [p.id for p in posts])

    def serialize(p: Post) -> dict:
        media = [{"url": m.media_url, "media_type": m.media_type} for m in p.media]
        if not media and p.image_url:
            media = [{"url": p.image_url, "media_type": "image"}]
        dist_km = None
        if lat is not None and lng is not None and p.location and p.location.coordinates:
            c = _parse_coords(p.location.coordinates)
            if c:
                dist_km = round(_haversine(lat, lng, c[0], c[1]), 1)
        return {
            "id": p.id,
            "content": p.content,
            "user_id": p.user_id,
            "username": p.user.username if p.user else f"user_{p.user_id}",
            "avatar_url": p.user.avatar_url if p.user else None,
            "location_name": p.location.name if p.location else None,
            "location_id": p.location_id,
            "distance_km": dist_km,
            "category": p.category,
            "media": media,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "like_count": like_counts.get(p.id, 0),
            "comment_count": comment_counts.get(p.id, 0),
            "is_liked": p.id in like_set,
            "is_bookmarked": p.id in bookmark_set,
            "is_marketplace": True,
            "listing_type": p.listing_type,
            "price": p.price,
            "currency": p.currency or "KRW",
            "sold": bool(p.sold),
        }

    return {"posts": [serialize(p) for p in posts], "total": total}


# ── Notifications ────────────────────────────────────────────────────────────

@app.get("/notifications/")
async def list_notifications(
    limit: int = 30,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    limit = min(max(limit, 1), 100)
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .options(
            joinedload(Notification.actor),
            selectinload(Notification.post).selectinload(Post.media),
            joinedload(Notification.comment),
        )
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    notifs = result.scalars().unique().all()

    total_res = await db.execute(
        select(func.count(Notification.id)).where(Notification.user_id == current_user.id)
    )
    total = total_res.scalar() or 0

    out = []
    for n in notifs:
        actor = n.actor
        thumb = None
        if n.post and n.post.media:
            thumb = n.post.media[0].media_url
        out.append({
            "id": n.id,
            "type": n.type,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "actor": {
                "id": actor.id,
                "username": actor.username,
                "avatar_url": actor.avatar_url,
            } if actor else None,
            "post_id": n.post_id,
            "post_thumb": thumb,
            "comment_id": n.comment_id,
            "comment_preview": (n.comment.content[:80] if n.comment and n.comment.content else None),
        })
    return {"notifications": out, "total": total}


@app.get("/notifications/unread-count")
async def notifications_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
    )
    return {"unread_count": result.scalar() or 0}


@app.post("/notifications/mark-all-read")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    await db.execute(
        sa_update(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    await db.commit()
    return {"status": "ok"}


@app.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    notif = result.scalar_one_or_none()
    if not notif or notif.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Not found")
    if not notif.is_read:
        notif.is_read = True
        await db.commit()
    return {"status": "ok"}


@app.delete("/notifications/{notification_id}")
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    notif = result.scalar_one_or_none()
    if not notif or notif.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(notif)
    await db.commit()
    return {"status": "ok"}
