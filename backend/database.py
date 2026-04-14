import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

# SQLite connection string
DATABASE_URL = "sqlite+aiosqlite:///./platform_a.db"

engine = create_async_engine(DATABASE_URL, echo=True, connect_args={"check_same_thread": False})
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

async def get_db():
    async with async_session() as session:
        yield session
