from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import get_db
from models import Post, Location, User
import shutil
import os

app = FastAPI()

# Serve static images
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload/")
async def upload_image(file: UploadFile = File(...)):
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"url": f"http://localhost:9000/{file_path}"}

@app.post("/posts/")
async def create_post(user_id: int, content: str, location_id: int, image_url: str = None, db: AsyncSession = Depends(get_db)):
    new_post = Post(user_id=user_id, content=content, location_id=location_id, image_url=image_url)
    db.add(new_post)
    await db.commit()
    await db.refresh(new_post)
    return {"status": "success", "post_id": new_post.id}

@app.get("/search/")
async def search_posts(location_id: int, db: AsyncSession = Depends(get_db)):
    # 쿼리 수행
    result = await db.execute(
        select(Post).where(Post.location_id == location_id)
    )
    posts = result.scalars().all()
    
    # 결과를 딕셔너리 리스트로 변환하여 반환
    return {
        "location_id": location_id,
        "posts": [{"id": p.id, "content": p.content, "user_id": p.user_id, "image_url": p.image_url} for p in posts]
    }
