import pytest
import pytest_asyncio


# ── Helpers ───────────────────────────────────────────────────────────────────

async def register(client, username="alice", password="pass1234"):
    res = await client.post("/auth/register", json={
        "username": username,
        "email": f"{username}@test.com",
        "password": password,
    })
    return res


async def login(client, username="alice", password="pass1234"):
    res = await client.post("/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200
    return res.json()["token"]


async def make_location(client):
    res = await client.post("/location/find-or-create/", json={"name": "Seoul", "lat": 37.5665, "lng": 126.978})
    assert res.status_code == 200
    return res.json()["location_id"]


async def make_post(client, token, location_id, content="Test post"):
    res = await client.post(
        "/posts/",
        json={"content": content, "location_id": location_id, "media": []},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201
    return res.json()["post_id"]


# ── Auth ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_success(client):
    res = await register(client, "user_reg1")
    assert res.status_code == 201
    data = res.json()
    assert "token" in data
    assert data["username"] == "user_reg1"


@pytest.mark.asyncio
async def test_register_duplicate(client):
    await register(client, "dupuser")
    res = await register(client, "dupuser")
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_register_short_password(client):
    res = await client.post("/auth/register", json={
        "username": "shortpw", "email": "shortpw@test.com", "password": "abc"
    })
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client):
    await register(client, "loginuser")
    token = await login(client, "loginuser")
    assert isinstance(token, str) and len(token) > 0


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await register(client, "wrongpw")
    res = await client.post("/auth/login", json={"username": "wrongpw", "password": "badpass"})
    assert res.status_code == 401


# ── Posts ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_and_fetch_post(client):
    await register(client, "poster1")
    token = await login(client, "poster1")
    loc_id = await make_location(client)
    post_id = await make_post(client, token, loc_id, "Hello world")

    res = await client.get(f"/search/?location_id={loc_id}")
    assert res.status_code == 200
    posts = res.json()["posts"]
    assert any(p["id"] == post_id for p in posts)


@pytest.mark.asyncio
async def test_edit_post(client):
    await register(client, "editor1")
    token = await login(client, "editor1")
    loc_id = await make_location(client)
    post_id = await make_post(client, token, loc_id)

    res = await client.patch(
        f"/posts/{post_id}",
        json={"content": "Edited content"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json()["content"] == "Edited content"


@pytest.mark.asyncio
async def test_edit_post_unauthorized(client):
    await register(client, "owner1")
    await register(client, "other1")
    token_owner = await login(client, "owner1")
    token_other = await login(client, "other1")
    loc_id = await make_location(client)
    post_id = await make_post(client, token_owner, loc_id)

    res = await client.patch(
        f"/posts/{post_id}",
        json={"content": "Hacked"},
        headers={"Authorization": f"Bearer {token_other}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_delete_post(client):
    await register(client, "deleter1")
    token = await login(client, "deleter1")
    loc_id = await make_location(client)
    post_id = await make_post(client, token, loc_id)

    res = await client.delete(f"/posts/{post_id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

    res = await client.get(f"/search/?location_id={loc_id}")
    posts = res.json()["posts"]
    assert not any(p["id"] == post_id for p in posts)


# ── Likes ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_like_and_unlike(client):
    await register(client, "liker1")
    token = await login(client, "liker1")
    loc_id = await make_location(client)
    post_id = await make_post(client, token, loc_id)

    res = await client.post(f"/posts/{post_id}/like", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 201
    assert res.json()["like_count"] == 1

    res = await client.delete(f"/posts/{post_id}/like", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["like_count"] == 0


@pytest.mark.asyncio
async def test_double_like_rejected(client):
    await register(client, "liker2")
    token = await login(client, "liker2")
    loc_id = await make_location(client)
    post_id = await make_post(client, token, loc_id)

    await client.post(f"/posts/{post_id}/like", headers={"Authorization": f"Bearer {token}"})
    res = await client.post(f"/posts/{post_id}/like", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 409


# ── Comments ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_comment_lifecycle(client):
    await register(client, "commenter1")
    token = await login(client, "commenter1")
    loc_id = await make_location(client)
    post_id = await make_post(client, token, loc_id)

    res = await client.post(
        f"/posts/{post_id}/comments",
        json={"content": "Great post!"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201
    comment_id = res.json()["id"]

    res = await client.get(f"/posts/{post_id}/comments")
    assert res.status_code == 200
    assert any(c["id"] == comment_id for c in res.json()["comments"])

    res = await client.delete(f"/comments/{comment_id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

    res = await client.get(f"/posts/{post_id}/comments")
    assert not any(c["id"] == comment_id for c in res.json()["comments"])


@pytest.mark.asyncio
async def test_empty_comment_rejected(client):
    await register(client, "commenter2")
    token = await login(client, "commenter2")
    loc_id = await make_location(client)
    post_id = await make_post(client, token, loc_id)

    res = await client.post(
        f"/posts/{post_id}/comments",
        json={"content": "   "},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422


# ── Follow ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_follow_unfollow(client):
    await register(client, "follower1")
    await register(client, "followed1")
    token_a = await login(client, "follower1")

    # Get followed user id
    res = await client.post("/auth/login", json={"username": "followed1", "password": "pass1234"})
    followed_id = res.json()["user_id"]

    res = await client.post(f"/users/{followed_id}/follow", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 201
    assert res.json()["follower_count"] == 1

    res = await client.delete(f"/users/{followed_id}/follow", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 200
    assert res.json()["follower_count"] == 0


@pytest.mark.asyncio
async def test_self_follow_rejected(client):
    await register(client, "selfuser1")
    res = await client.post("/auth/login", json={"username": "selfuser1", "password": "pass1234"})
    data = res.json()
    token = data["token"]
    user_id = data["user_id"]

    res = await client.post(f"/users/{user_id}/follow", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_following_feed(client):
    await register(client, "feeduser_a")
    await register(client, "feeduser_b")
    token_a = await login(client, "feeduser_a")
    token_b = await login(client, "feeduser_b")

    res_b = await client.post("/auth/login", json={"username": "feeduser_b", "password": "pass1234"})
    user_b_id = res_b.json()["user_id"]

    loc_id = await make_location(client)
    await make_post(client, token_b, loc_id, "Post by B")

    # Before follow: empty feed
    res = await client.get("/feed/following", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 200
    assert res.json()["posts"] == []

    # Follow B
    await client.post(f"/users/{user_b_id}/follow", headers={"Authorization": f"Bearer {token_a}"})

    # After follow: B's post appears
    res = await client.get("/feed/following", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 200
    assert len(res.json()["posts"]) >= 1


# ── Profile ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_profile_stats(client):
    await register(client, "profuser1")
    res = await client.post("/auth/login", json={"username": "profuser1", "password": "pass1234"})
    data = res.json()
    token = data["token"]
    user_id = data["user_id"]

    loc_id = await make_location(client)
    await make_post(client, token, loc_id)

    res = await client.get(f"/users/{user_id}")
    assert res.status_code == 200
    profile = res.json()
    assert profile["post_count"] >= 1
    assert "follower_count" in profile
    assert "following_count" in profile
