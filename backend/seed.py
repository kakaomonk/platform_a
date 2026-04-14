import asyncio
from database import async_session
from models import Location, User, Post
from auth import hash_password


async def seed_data():
    async with async_session() as session:
        state = Location(name="California", level="state")
        session.add(state)
        await session.commit()
        await session.refresh(state)

        city = Location(name="San Francisco", level="city", parent_id=state.id)
        session.add(city)
        await session.commit()
        await session.refresh(city)

        # Seed user with a known password for dev testing
        user = User(
            username="testuser",
            email="test@example.com",
            password_hash=hash_password("password123"),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        post = Post(
            user_id=user.id,
            content="Amazing sunset at SF!",
            location_id=city.id,
            image_url="https://images.unsplash.com/photo-1501594907352-04cda38ebc29?q=80&w=600",
        )
        session.add(post)
        await session.commit()

        print(f"Seeded: user='{user.username}' password='password123', city='San Francisco' (id={city.id})")


if __name__ == "__main__":
    asyncio.run(seed_data())
