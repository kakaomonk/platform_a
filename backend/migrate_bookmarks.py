"""
Creates the bookmarks table.
Run: python migrate_bookmarks.py
"""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL env var not set")


async def run():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS bookmarks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT uq_user_post_bookmark UNIQUE (user_id, post_id)
            );
        """))
        print("OK bookmarks table")

        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_bookmarks_user
            ON bookmarks (user_id, post_id);
        """))
        print("OK idx_bookmarks_user")

    await engine.dispose()
    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(run())
