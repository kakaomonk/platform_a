import asyncio
from sqlalchemy import text
from database import engine, Base
from models import Location, User, Post, SearchHistory, Like, Comment, Follow  # noqa: F401

# Idempotent additive column migrations for tables Base.metadata.create_all won't touch.
ADDITIVE_MIGRATIONS = [
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_marketplace BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS price INTEGER",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'KRW'",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS sold BOOLEAN NOT NULL DEFAULT false",
]


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in ADDITIVE_MIGRATIONS:
            await conn.execute(text(stmt))
    print("Database tables created!")


if __name__ == "__main__":
    asyncio.run(init_db())
