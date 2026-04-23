from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, UniqueConstraint, Boolean, Float
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
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

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
    image_url = Column(String(255), nullable=True)
    location_id = Column(Integer, ForeignKey("locations.id"))
    location_coords = Column(String(50))
    category = Column(String(50), nullable=True)
    is_marketplace = Column(Boolean, default=False, nullable=False, server_default="false")
    listing_type = Column(String(4), nullable=True)  # "sell" or "buy" (only for marketplace posts)
    price = Column(Integer, nullable=True)  # KRW, nullable even for marketplace (price-on-request)
    currency = Column(String(3), nullable=True, default="KRW")
    sold = Column(Boolean, default=False, nullable=False, server_default="false")
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
    media_type = Column(String(10), default="image")
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


class Bookmark(Base):
    __tablename__ = "bookmarks"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("user_id", "post_id", name="uq_user_post_bookmark"),)

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


class Follow(Base):
    __tablename__ = "follows"
    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    following_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("follower_id", "following_id", name="uq_follow"),)

    follower = relationship("User", foreign_keys=[follower_id])
    following = relationship("User", foreign_keys=[following_id])


class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(Integer, primary_key=True, index=True)
    user1_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user2_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("user1_id", "user2_id", name="uq_conversation"),)

    user1 = relationship("User", foreign_keys=[user1_id])
    user2 = relationship("User", foreign_keys=[user2_id])
    messages = relationship("DirectMessage", back_populates="conversation", cascade="all, delete-orphan")


class DirectMessage(Base):
    __tablename__ = "direct_messages"
    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(30), nullable=False)  # follow | like | comment | mention_post | mention_comment
    post_id = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=True)
    comment_id = Column(Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    user = relationship("User", foreign_keys=[user_id])
    actor = relationship("User", foreign_keys=[actor_id])
    post = relationship("Post", foreign_keys=[post_id])
    comment = relationship("Comment", foreign_keys=[comment_id])
