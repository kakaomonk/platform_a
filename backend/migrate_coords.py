"""One-time migration: add latitude/longitude columns and populate from coordinates string.

Run once on any existing database before deploying:
    python migrate_coords.py
"""
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

from database import engine
from models import Location


async def main():
    async with engine.begin() as conn:
        await conn.execute(text(
            "ALTER TABLE locations ADD COLUMN IF NOT EXISTS latitude FLOAT"
        ))
        await conn.execute(text(
            "ALTER TABLE locations ADD COLUMN IF NOT EXISTS longitude FLOAT"
        ))

    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as session:
        result = await session.execute(
            select(Location).where(Location.coordinates.isnot(None))
        )
        locs = result.scalars().all()
        updated = 0
        for loc in locs:
            try:
                parts = loc.coordinates.split(",")
                loc.latitude = float(parts[0].strip())
                loc.longitude = float(parts[1].strip())
                updated += 1
            except (ValueError, IndexError):
                pass
        await session.commit()

    print(f"Migrated {updated} locations")
    await engine.dispose()


asyncio.run(main())
