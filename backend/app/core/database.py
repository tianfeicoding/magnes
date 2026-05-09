# backend/app/core/database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# 数据库文件路径
# 使用相对文件位置的绝对路径，防止因运行 CWD 不同导致创建冗余目录
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
DB_PATH = os.path.join(BACKEND_ROOT, "data", "magnes.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# 异步 SQLite 连接字符串 (使用 aiosqlite)
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

# 创建异步引擎 (生产环境/调试整洁建议 echo=False)
engine = create_async_engine(DATABASE_URL, echo=False)

# 创建异步会话工厂
AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# 基类，用于模型继承
Base = declarative_base()

# 获取数据库会话的依赖项
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
