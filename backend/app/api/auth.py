"""
Authentication routes for user management
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.users import (
    fastapi_users,
    auth_backend,
    get_user_manager,
    current_user
)
from app.models.user import User


router = APIRouter(prefix="/auth", tags=["auth"])


# Pydantic models for requests
class QuickRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str


class UserRead(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str


# Include FastAPI-Users standard routes
router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/jwt",
)
router.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/jwt",
)


@router.post("/quick-register", response_model=TokenResponse)
async def quick_register(
    data: QuickRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Quick register: if user exists, login; if not, create new user
    """
    from app.core.users import UserManager
    from fastapi_users.db import SQLAlchemyUserDatabase

    user_db = SQLAlchemyUserDatabase(db, User)
    manager = UserManager(user_db)

    try:
        # Try to find existing user
        existing = await manager.get_by_username(data.username)

        # User exists - verify password
        is_valid, _ = manager.password_helper.verify_and_update(data.password, existing.hashed_password)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户名已存在，密码错误"
            )

        user = existing

    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e).lower()
        # User doesn't exist - create new
        if "does not exist" in error_msg or "not found" in error_msg:
            try:
                # Create new user - 使用 SQLAlchemy 直接创建
                import uuid
                from datetime import datetime

                # 创建用户对象
                new_user = User(
                    id=str(uuid.uuid4()),
                    username=data.username,
                    email=None,
                    is_active=True,
                    is_superuser=False,
                    created_at=datetime.utcnow()
                )
                # 设置密码哈希
                new_user.hashed_password = manager.password_helper.hash(data.password)
                print(f"[Auth] Password hashed successfully, length: {len(new_user.hashed_password)}")

                # 保存到数据库
                db.add(new_user)
                await db.commit()
                await db.refresh(new_user)

                user = new_user
                print(f"[Auth] Created new user: {user.username} (id: {user.id})")
            except Exception as create_error:
                print(f"[Auth] User creation error: {create_error}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"创建用户失败: {str(create_error)}"
                )
        else:
            print(f"[Auth] Unexpected error in quick_register: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"服务器错误: {str(e)}"
            )

    # Generate token
    try:
        strategy = auth_backend.get_strategy()
        token = await strategy.write_token(user)
        return TokenResponse(access_token=token, token_type="bearer")
    except Exception as e:
        print(f"[Auth] Token generation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"生成令牌失败: {str(e)}"
        )


@router.get("/me", response_model=UserRead)
async def get_me(user: User = Depends(current_user)):
    """Get current user info"""
    return user
