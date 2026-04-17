"""
One-time migration: adds category column to posts, creates conversations and direct_messages tables.
Run: python migrate.py
"""
import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL env var not set")


async def run():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        # Add category to posts (safe to run multiple times)
        await conn.execute(text("""
            ALTER TABLE posts
            ADD COLUMN IF NOT EXISTS category VARCHAR(50);
        """))
        print("OK posts.category")

        # Conversations table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                updated_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT uq_conversation UNIQUE (user1_id, user2_id)
            );
        """))
        print("OK conversations")

        # Direct messages table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS direct_messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """))
        print("OK direct_messages")

        # Index for fast unread queries
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_dm_conv_read
            ON direct_messages (conversation_id, is_read, sender_id);
        """))
        print("OK index idx_dm_conv_read")

    await engine.dispose()
    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(run())
