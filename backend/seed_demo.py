import asyncio
from sqlalchemy.future import select
from sqlalchemy import func
from database import async_session
from models import Location, User, Post, PostMedia, Like, Comment
from auth import hash_password

CITIES = [
    {"name": "Toronto",     "lat": 43.6532,  "lng": -79.3832},
    {"name": "Vancouver",   "lat": 49.2827,  "lng": -123.1207},
    {"name": "Montreal",    "lat": 45.5017,  "lng": -73.5673},
    {"name": "New York",    "lat": 40.7128,  "lng": -74.0060},
    {"name": "Chicago",     "lat": 41.8781,  "lng": -87.6298},
    {"name": "Los Angeles", "lat": 34.0522,  "lng": -118.2437},
    {"name": "London",      "lat": 51.5074,  "lng": -0.1278},
    {"name": "Paris",       "lat": 48.8566,  "lng": 2.3522},
    {"name": "Tokyo",       "lat": 35.6762,  "lng": 139.6503},
    {"name": "Seoul",       "lat": 37.5665,  "lng": 126.9780},
    {"name": "Sydney",      "lat": -33.8688, "lng": 151.2093},
    {"name": "Singapore",   "lat": 1.3521,   "lng": 103.8198},
]

USERS = [
    {"username": "testuser", "email": "test@example.com",   "password": "password123"},
    {"username": "henry",    "email": "henry@demo.com",     "password": "password123"},
    {"username": "minjun",   "email": "minjun@demo.com",    "password": "password123"},
    {"username": "yuna",     "email": "yuna@demo.com",      "password": "password123"},
    {"username": "james",    "email": "james@demo.com",     "password": "password123"},
]

POSTS = [
    # Toronto
    {
        "city": "Toronto", "user": "henry",
        "content": "Kensington Market on a Saturday — vinyl records, vintage jackets, and the best empanadas I've had outside of Buenos Aires.",
        "images": ["https://images.unsplash.com/photo-1517935706615-2717063c2225?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "Toronto", "user": "minjun",
        "content": "CN Tower at sunset. Classic, obvious, absolutely worth it. The glass floor is genuinely unsettling.",
        "images": ["https://images.unsplash.com/photo-1507992781348-310259076fe0?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "Toronto", "user": "yuna",
        "content": "St. Lawrence Market — got there at 8am. Peameal bacon sandwich at Carousel Bakery. Nothing else needed.",
        "images": ["https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=800"],
        "category": "food",
    },
    {
        "city": "Toronto", "user": "james",
        "content": "Distillery District in November. Quiet, atmospheric, cobblestones still wet from rain. Best version of this place.",
        "images": ["https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=800"],
        "category": "travel",
    },
    # Vancouver
    {
        "city": "Vancouver", "user": "testuser",
        "content": "Stanley Park seawall at dawn. Mountains behind, city ahead, nobody else around. This city is unfair.",
        "images": ["https://images.unsplash.com/photo-1559511260-66a654ae982a?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "Vancouver", "user": "henry",
        "content": "Granville Island Public Market. The hot sauce selection alone is worth the trip.",
        "images": ["https://images.unsplash.com/photo-1488459716781-31db52582fe9?q=80&w=800"],
        "category": "food",
    },
    # Montreal
    {
        "city": "Montreal", "user": "yuna",
        "content": "Old Port on a Friday evening. Cobblestones, fairy lights, and a crowd that genuinely knows how to enjoy a summer night.",
        "images": ["https://images.unsplash.com/photo-1519178614-68673b201f36?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "Montreal", "user": "minjun",
        "content": "Schwartz's smoked meat at 11pm. Waited 40 minutes. Completely justified.",
        "images": ["https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=800"],
        "category": "food",
    },
    # Chicago
    {
        "city": "Chicago", "user": "james",
        "content": "The Bean at golden hour — everyone's a photographer for five minutes. Can't blame them.",
        "images": ["https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "Chicago", "user": "testuser",
        "content": "Deep dish at Lou Malnati's. I understand now why this is an argument people take seriously.",
        "images": ["https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=800"],
        "category": "food",
    },
    # Los Angeles
    {
        "city": "Los Angeles", "user": "henry",
        "content": "Griffith Observatory at dusk. The city spreads out forever. On a clear day you can see why people move here.",
        "images": ["https://images.unsplash.com/photo-1580655653885-65763b2597d1?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "Los Angeles", "user": "yuna",
        "content": "Grand Central Market — breakfast tacos, fresh juice, and coffee. The best $12 morning in the city.",
        "images": ["https://images.unsplash.com/photo-1565299585323-38d6b0865b47?q=80&w=800"],
        "category": "food",
    },
    # Seoul
    {
        "city": "Seoul", "user": "henry",
        "content": "Bukchon Hanok Village at dawn — no crowds, just silence between the alleyways.",
        "images": ["https://images.unsplash.com/photo-1534430480872-3498386e7856?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "Seoul", "user": "minjun",
        "content": "Gyeongbokgung Palace guards change ceremony. Showed up 10 minutes early and got the perfect spot.",
        "images": ["https://images.unsplash.com/photo-1549566616-4f4f6a5b2b3e?q=80&w=800"],
        "category": "culture",
    },
    {
        "city": "Seoul", "user": "yuna",
        "content": "Han River at golden hour. Brought ramyeon and stayed until the city lights came on.",
        "images": ["https://images.unsplash.com/photo-1593604572577-1c6c44fa2f6e?q=80&w=800"],
        "category": "food",
    },
    {
        "city": "Tokyo", "user": "james",
        "content": "Senso-ji before the crowds arrive. 6am entry is the only way to experience this properly.",
        "images": ["https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "Tokyo", "user": "henry",
        "content": "Shibuya Crossing at midnight — somehow even busier than rush hour. Still can't explain it.",
        "images": ["https://images.unsplash.com/photo-1542051841857-5f90071e7989?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "Tokyo", "user": "minjun",
        "content": "Ramen at 2am in Shinjuku. ¥850 for a bowl that genuinely made me reconsider everything.",
        "images": ["https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?q=80&w=800"],
        "category": "food",
    },
    {
        "city": "New York", "user": "yuna",
        "content": "Brooklyn Bridge at sunrise. Walked across twice. Worth every step.",
        "images": ["https://images.unsplash.com/photo-1534430480872-3498386e7856?q=80&w=800",
                   "https://images.unsplash.com/photo-1522083165195-3424ed129620?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "New York", "user": "james",
        "content": "Central Park in October. The foliage was exactly what you imagine before you move here.",
        "images": ["https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "New York", "user": "testuser",
        "content": "Corner bodega coffee at 7am. This city runs on it.",
        "images": ["https://images.unsplash.com/photo-1509042239860-f550ce710b93?q=80&w=800"],
        "category": "food",
    },
    {
        "city": "London", "user": "henry",
        "content": "Borough Market on a Saturday — showed up hungry, left with three bags and a new favourite cheese.",
        "images": ["https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=800"],
        "category": "food",
    },
    {
        "city": "London", "user": "minjun",
        "content": "Tower Bridge at blue hour. The scaffolding finally came down.",
        "images": ["https://images.unsplash.com/photo-1529655683826-aba9b3e77383?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "Paris", "user": "yuna",
        "content": "Café de Flore on a Tuesday afternoon. A cortado, a notebook, and two hours that felt like ten minutes.",
        "images": ["https://images.unsplash.com/photo-1499856871958-5b9627545d1a?q=80&w=800"],
        "category": "food",
    },
    {
        "city": "Paris", "user": "james",
        "content": "Eiffel Tower from Trocadéro at dusk. Obvious, but the obvious things are obvious for a reason.",
        "images": ["https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "Toronto", "user": "testuser",
        "content": "AGO on a quiet Wednesday afternoon. Emily Carr room is worth the whole trip.",
        "images": ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=80&w=800"],
        "category": "culture",
    },
    {
        "city": "Vancouver", "user": "minjun",
        "content": "Capilano Suspension Bridge in the rain. Quieter than expected. The canyon fog makes it.",
        "images": ["https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=800"],
        "category": "nature",
    },
    {
        "city": "Montreal", "user": "james",
        "content": "Mont-Royal summit at golden hour. Every direction is a postcard. The city doesn't quit.",
        "images": ["https://images.unsplash.com/photo-1492571350019-22de08371fd3?q=80&w=800"],
        "category": "travel",
    },
    # Sydney
    {
        "city": "Sydney", "user": "testuser",
        "content": "Bondi to Coogee coastal walk. 6km, three beaches, zero regrets.",
        "images": ["https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?q=80&w=800"],
        "category": "travel",
    },
    # Singapore
    {
        "city": "Singapore", "user": "henry",
        "content": "Gardens by the Bay Supertrees after dark. Felt like walking inside a screensaver.",
        "images": ["https://images.unsplash.com/photo-1525625293386-3f8f99389edd?q=80&w=800"],
        "category": "travel",
    },
    {
        "city": "Singapore", "user": "minjun",
        "content": "Maxwell Food Centre hawker stalls. Chicken rice, char kway teow, kaya toast — all for under $10.",
        "images": ["https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=800"],
        "category": "food",
    },
]

MARKETPLACE = [
    {
        "city": "Seoul", "user": "yuna",
        "content": "Sony A7III + 35mm f/1.8 lens. Bought last year, used maybe 15 times. Mint condition.",
        "images": ["https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=800"],
        "listing_type": "sell", "price": 1800000, "category": "electronics",
    },
    {
        "city": "Tokyo", "user": "james",
        "content": "Looking for a used road bike. Budget ₩600k-800k. Prefer Shimano 105 groupset or above.",
        "images": ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=80&w=800"],
        "listing_type": "buy", "price": 700000, "category": "sports",
    },
    {
        "city": "London", "user": "testuser",
        "content": "Aesop Marrakech Intense 50ml — unopened, gift that wasn't my scent. Happy to meet in Zone 1.",
        "images": ["https://images.unsplash.com/photo-1541643600914-78b084683702?q=80&w=800"],
        "listing_type": "sell", "price": 95000, "category": "beauty",
    },
    {
        "city": "New York", "user": "henry",
        "content": "Nike Air Jordan 1 Retro High OG 'Chicago' — size 10, worn twice. Box included.",
        "images": ["https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800"],
        "listing_type": "sell", "price": 450000, "category": "fashion",
    },
    {
        "city": "Seoul", "user": "minjun",
        "content": "MacBook Pro 14\" M3 Pro 2024. Moving abroad, need to sell before Thursday.",
        "images": ["https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=800"],
        "listing_type": "sell", "price": 2400000, "category": "electronics",
    },
]

COMMENTS = [
    ("henry", 0, "This place is on my list for next month. Did you need to book in advance?"),
    ("yuna", 1, "The guards are so precise. Watched the ceremony three times."),
    ("james", 3, "Best early morning tip I've read all year. Setting an alarm."),
    ("testuser", 4, "I've been here six times and still stop and stare every single time."),
    ("minjun", 7, "Which entrance did you use? Last time I went the West side was packed."),
    ("henry", 9, "Borough is dangerous. I always spend three times what I plan."),
    ("yuna", 12, "The afternoon light through those windows is something else."),
]


async def get_or_create_user(session, username, email, password):
    result = await session.execute(
        select(User).where(func.lower(User.username) == username.lower())
    )
    user = result.scalar_one_or_none()
    if not user:
        user = User(username=username, email=email, password_hash=hash_password(password))
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user


async def get_or_create_city(session, name, lat, lng):
    result = await session.execute(
        select(Location).where(func.lower(Location.name) == name.lower())
    )
    loc = result.scalar_one_or_none()
    if not loc:
        loc = Location(
            name=name,
            level="city",
            coordinates=f"{lat:.6f},{lng:.6f}",
            latitude=lat,
            longitude=lng,
        )
        session.add(loc)
        await session.commit()
        await session.refresh(loc)
    elif not loc.latitude:
        loc.latitude = lat
        loc.longitude = lng
        loc.coordinates = f"{lat:.6f},{lng:.6f}"
        await session.commit()
    return loc


async def seed():
    async with async_session() as session:
        print("Creating cities...")
        city_map = {}
        for c in CITIES:
            loc = await get_or_create_city(session, c["name"], c["lat"], c["lng"])
            city_map[c["name"]] = loc
            print(f"  {loc.name} (id={loc.id})")

        print("Creating users...")
        user_map = {}
        for u in USERS:
            user = await get_or_create_user(session, u["username"], u["email"], u["password"])
            user_map[u["username"]] = user
            print(f"  {user.username} (id={user.id})")

        print("Creating posts...")
        created_posts = []
        for p in POSTS:
            city = city_map[p["city"]]
            user = user_map[p["user"]]
            post = Post(
                user_id=user.id,
                content=p["content"],
                location_id=city.id,
                category=p.get("category"),
                is_marketplace=False,
            )
            session.add(post)
            await session.flush()
            for i, url in enumerate(p["images"]):
                session.add(PostMedia(post_id=post.id, media_url=url, media_type="image", order=i))
            await session.commit()
            created_posts.append(post)
            print(f"  [{p['city']}] {p['content'][:50]}...")

        print("Creating marketplace posts...")
        for m in MARKETPLACE:
            city = city_map[m["city"]]
            user = user_map[m["user"]]
            post = Post(
                user_id=user.id,
                content=m["content"],
                location_id=city.id,
                category=m.get("category"),
                is_marketplace=True,
                listing_type=m["listing_type"],
                price=m["price"],
                currency="KRW",
            )
            session.add(post)
            await session.flush()
            for i, url in enumerate(m["images"]):
                session.add(PostMedia(post_id=post.id, media_url=url, media_type="image", order=i))
            await session.commit()
            print(f"  [marketplace/{m['listing_type']}] {m['content'][:50]}...")

        print("Adding likes...")
        all_post_ids = [p.id for p in created_posts]
        like_pairs = [
            ("henry", 1), ("yuna", 1), ("james", 1),
            ("minjun", 2), ("testuser", 2),
            ("henry", 3), ("james", 3),
            ("testuser", 4), ("yuna", 4), ("minjun", 4),
            ("henry", 5), ("testuser", 5),
            ("yuna", 6), ("james", 6),
            ("minjun", 7), ("henry", 7),
            ("testuser", 8),
            ("yuna", 9), ("james", 9), ("henry", 9),
            ("minjun", 10), ("testuser", 10),
        ]
        for username, post_idx in like_pairs:
            if post_idx - 1 < len(created_posts):
                user = user_map[username]
                post = created_posts[post_idx - 1]
                existing = await session.execute(
                    select(Like).where(Like.user_id == user.id, Like.post_id == post.id)
                )
                if not existing.scalar_one_or_none():
                    session.add(Like(user_id=user.id, post_id=post.id))
        await session.commit()

        print("Adding comments...")
        for username, post_idx, text in COMMENTS:
            if post_idx < len(created_posts):
                user = user_map[username]
                post = created_posts[post_idx]
                session.add(Comment(user_id=user.id, post_id=post.id, content=text))
        await session.commit()

        print(f"\nDone! {len(created_posts)} posts, {len(MARKETPLACE)} marketplace, "
              f"{len(COMMENTS)} comments across {len(CITIES)} cities.")
        print("Login: testuser / password123")


if __name__ == "__main__":
    asyncio.run(seed())
