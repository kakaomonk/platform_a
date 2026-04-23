"""
Adds listing_type column to posts table and backfills existing marketplace rows as 'sell'.
Run: python migrate_listing_type.py
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
            ALTER TABLE posts
            ADD COLUMN IF NOT EXISTS listing_type VARCHAR(4);
        """))
        print("OK posts.listing_type column added")

        result = await conn.execute(text("""
            UPDATE posts
            SET listing_type = 'sell'
            WHERE is_marketplace = TRUE AND listing_type IS NULL;
        """))
        print(f"OK backfilled {result.rowcount} marketplace rows as 'sell'")

    await engine.dispose()
    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(run())
