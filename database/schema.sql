# Updated Database Schema for Hierarchical Location Search

CREATE EXTENSION IF NOT EXISTS postgis;

-- Locations table for hierarchical lookup
CREATE TABLE locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    level VARCHAR(50) NOT NULL, -- 'city', 'state', 'country'
    parent_id INTEGER REFERENCES locations(id),
    geom GEOGRAPHY(POINT, 4326)
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    content TEXT,
    location_id INTEGER REFERENCES locations(id),
    location_geog GEOGRAPHY(POINT, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_posts_location_id ON posts(location_id);
CREATE INDEX idx_posts_location_geog ON posts USING GIST(location_geog);
