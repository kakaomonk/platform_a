import asyncio
import math
import os
import shutil
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

import requests as http_requests
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload, joinedload, contains_eager

from database import get_db
from models import Post, PostMedia, Location, User, SearchHistory, Like, Comment, Follow, Conversation, DirectMessage  # noqa: F401
from auth import hash_password, verify_password, create_token, get_optional_user, require_user

app = FastAPI()

BASE_URL = os.getenv("BASE_URL", "http://localhost:9000")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")]

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
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
        result.append({"url": f"{BASE_URL}/{dest}", "media_type": media_type})
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
    category: Optional[str] = None


class PostUpdate(BaseModel):
    content: Optional[str] = None
    location_id: Optional[int] = None
    category: Optional[str] = None


@app.post("/posts/", status_code=status.HTTP_201_CREATED)
async def create_post(
    payload: PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_user),
):
    post = Post(user_id=current_user.id, content=payload.content, location_id=payload.location_id, category=payload.category)
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
    if payload.category is not None:
        post.category = payload.category if payload.category != "" else None

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
    q = select(Post).where(Post.location_id == location_id)
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

    filters = [or_(Post.content.ilike(f"%{q}%"), Location.name.ilike(f"%{q}%"))]
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
    feed_q = select(Post).options(selectinload(Post.media), joinedload(Post.location), joinedload(Post.user))
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
    await db.commit()
    count = await db.execute(select(func.count(Like.id)).where(Like.post_id == post_id))
    return {"status": "liked", "like_count": count.scalar()}


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
    comment = Comment(user_id=current_user.id, post_id=post_id, content=payload.content.strip())
    db.add(comment)
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
    dest = f"uploads/{safe_name}"

    # Remove old avatar file
    if current_user.avatar_url:
        old = current_user.avatar_url.replace(f"{BASE_URL}/", "")
        if os.path.isfile(old):
            os.remove(old)

    with open(dest, "wb") as buf:
        shutil.copyfileobj(file.file, buf)

    current_user.avatar_url = f"{BASE_URL}/{dest}"
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

    where_clauses = [Post.user_id.in_(following_ids)]
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
