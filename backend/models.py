from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Location(Base):
    __tablename__ = "locations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    level = Column(String(50), nullable=False)
    parent_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    coordinates = Column(String(50))

    parent = relationship("Location", remote_side=[id])


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    bio = Column(String(300), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class Post(Base):
    __tablename__ = "posts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    content = Column(Text)
    image_url = Column(String(255), nullable=True)  # legacy — superseded by post_media
    location_id = Column(Integer, ForeignKey("locations.id"))
    location_coords = Column(String(50))
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
    location = relationship("Location")
    media = relationship(
        "PostMedia",
        back_populates="post",
        order_by="PostMedia.order",
        cascade="all, delete-orphan",
    )


class PostMedia(Base):
    __tablename__ = "post_media"
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    media_url = Column(String(500), nullable=False)
    media_type = Column(String(10), default="image")  # image | video
    order = Column(Integer, default=0)

    post = relationship("Post", back_populates="media")


class SearchHistory(Base):
    __tablename__ = "search_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    query_text = Column(String(255), nullable=True)
    searched_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
    location = relationship("Location")


class Like(Base):
    __tablename__ = "likes"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("user_id", "post_id", name="uq_user_post_like"),)

    user = relationship("User")
    post = relationship("Post")


class Comment(Base):
    __tablename__ = "comments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
    post = relationship("Post")
