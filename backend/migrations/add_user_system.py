"""
Migration script: Add user system to database
1. Create users table
2. Add user_id column to existing tables
3. Create default user (optional)
"""
import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.database import DATABASE_URL


def migrate_sync():
    """Synchronous migration using sync engine"""
    # Convert async sqlite URL to sync
    sync_url = DATABASE_URL.replace("+aiosqlite", "")
    engine = create_engine(sync_url)

    with engine.connect() as conn:
        print("[Migration] Creating users table...")

        # 1. Create users table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR PRIMARY KEY,
                email VARCHAR UNIQUE,
                username VARCHAR UNIQUE NOT NULL,
                hashed_password VARCHAR NOT NULL,
                api_key TEXT,
                api_base_url VARCHAR DEFAULT 'https://api.openai.com/v1',
                is_active BOOLEAN DEFAULT 1,
                is_superuser BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        """))

        # 2. Add user_id to templates table
        try:
            conn.execute(text("""
                ALTER TABLE templates ADD COLUMN user_id VARCHAR
                REFERENCES users(id) ON DELETE SET NULL
            """))
            print("[Migration] Added user_id to templates table")
        except Exception as e:
            print(f"[Migration] templates.user_id may already exist: {e}")

        # 3. Add user_id to generation_history table
        try:
            conn.execute(text("""
                ALTER TABLE generation_history ADD COLUMN user_id VARCHAR
                REFERENCES users(id) ON DELETE SET NULL
            """))
            print("[Migration] Added user_id to generation_history table")
        except Exception as e:
            print(f"[Migration] generation_history.user_id may already exist: {e}")

        conn.commit()
        print("[Migration] User system migration completed!")


async def migrate_async():
    """Async migration"""
    engine = create_async_engine(DATABASE_URL)

    async with engine.begin() as conn:
        print("[Migration] Creating users table...")

        # 1. Create users table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR PRIMARY KEY,
                email VARCHAR UNIQUE,
                username VARCHAR UNIQUE NOT NULL,
                hashed_password VARCHAR NOT NULL,
                api_key TEXT,
                api_base_url VARCHAR DEFAULT 'https://api.openai.com/v1',
                is_active BOOLEAN DEFAULT 1,
                is_superuser BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        """))

        # 2. Add user_id to templates table
        try:
            await conn.execute(text("""
                ALTER TABLE templates ADD COLUMN user_id VARCHAR
                REFERENCES users(id) ON DELETE SET NULL
            """))
            print("[Migration] Added user_id to templates table")
        except Exception as e:
            print(f"[Migration] templates.user_id may already exist: {e}")

        # 3. Add user_id to generation_history table
        try:
            await conn.execute(text("""
                ALTER TABLE generation_history ADD COLUMN user_id VARCHAR
                REFERENCES users(id) ON DELETE SET NULL
            """))
            print("[Migration] Added user_id to generation_history table")
        except Exception as e:
            print(f"[Migration] generation_history.user_id may already exist: {e}")

    await engine.dispose()
    print("[Migration] User system migration completed!")


if __name__ == "__main__":
    print("[Migration] Starting user system migration...")
    try:
        # Try async first
        asyncio.run(migrate_async())
    except Exception as e:
        print(f"[Migration] Async failed, trying sync: {e}")
        migrate_sync()
