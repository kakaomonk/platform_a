import asyncio
import time
from database import async_session
from models import Location, User, Post

async def seed_data():
    async with async_session() as session:
        # Use a timestamp to ensure uniqueness for email and username
        ts = str(int(time.time()))
        
        state = Location(name="California", level="state")
        session.add(state)
        await session.commit()
        await session.refresh(state)

        city = Location(name="San Francisco", level="city", parent_id=state.id)
        session.add(city)
        await session.commit()
        await session.refresh(city)

        user = User(username=f"testuser_{ts}", email=f"test_{ts}@example.com")
        session.add(user)
        await session.commit()
        await session.refresh(user)

        post = Post(user_id=user.id, content="Amazing sunset at SF!", location_id=city.id, image_url='https://images.unsplash.com/photo-1501594907352-04cda38ebc29?q=80&w=600')
        session.add(post)
        await session.commit()

        print("Data seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed_data())
