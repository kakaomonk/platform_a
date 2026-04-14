# Location-Based Discovery Platform

A location-based discovery platform inspired by Xiaohongshu, built for global users.

## Prerequisites
- [Python 3.14+](https://www.python.org/)
- [Node.js 18+](https://nodejs.org/)
- [PostgreSQL](https://www.postgresql.org/) (Recommended for production, SQLite is currently used for local development)

## Local Setup

### 1. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```
3. Install dependencies:
   ```bash
   pip install fastapi uvicorn sqlalchemy aiosqlite python-multipart requests
   ```
4. Initialize the database and seed data:
   ```bash
   python init_db.py
   python seed.py
   ```
5. Run the backend server:
   ```bash
   python -m uvicorn main:app --port 9000 --reload
   ```

### 2. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

### 3. Running the Application
- Open your browser and go to `http://localhost:5173`.
- The frontend will communicate with the backend on port `9000`.

## Features
- **Location-based Feed**: Discover content based on location hierarchy.
- **Image Upload**: Upload images for your posts.
- **Responsive UI**: Modern card-style feed layout.
- **Google Maps Integration**: (Ready for API key configuration).
