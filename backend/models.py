from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Location(Base):
    __tablename__ = "locations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    level = Column(String(50), nullable=False)  # 'city', 'state', 'country'
    parent_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    # Using String for coordinates in SQLite for simplicity
    coordinates = Column(String(50))
    
    parent = relationship("Location", remote_side=[id])

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class Post(Base):
    __tablename__ = "posts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    content = Column(Text)
    image_url = Column(String(255), nullable=True)  # Added column
    location_id = Column(Integer, ForeignKey("locations.id"))
    location_coords = Column(String(50))
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
    location = relationship("Location")
