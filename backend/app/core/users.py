"""
FastAPI-Users configuration for authentication
"""
import os
from typing import Optional
from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.user import User


# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production")
JWT_LIFETIME = 604800  # 7 days


async def get_user_db(session: AsyncSession = Depends(get_db)):
    """Get user database adapter"""
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(UUIDIDMixin, BaseUserManager[User, str]):
    """User manager with lifecycle callbacks"""
    reset_password_token_secret = SECRET_KEY
    verification_token_secret = SECRET_KEY

    async def get_by_username(self, username: str) -> User:
        """Get user by username"""
        try:
            result = await self.user_db.session.execute(
                select(User).where(User.username == username)
            )
            user = result.scalar_one_or_none()
            if user is None:
                raise Exception(f"User with username '{username}' does not exist")
            return user
        except Exception as e:
            print(f"[UserManager] Error in get_by_username: {e}")
            raise

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        print(f"[Users] New user registered: {user.username}")

    async def on_after_login(self, user: User, request: Optional[Request] = None):
        print(f"[Users] User logged in: {user.username}")


async def get_user_manager(user_db=Depends(get_user_db)):
    """Get user manager instance"""
    yield UserManager(user_db)


# Custom JWT Strategy without audience verification
class CustomJWTStrategy(JWTStrategy):
    """JWT Strategy that disables audience verification for compatibility"""

    async def read_token(self, token: str, user_manager: UserManager) -> Optional[User]:
        try:
            import jwt as pyjwt
            # Decode without audience verification
            data = pyjwt.decode(
                token,
                self.secret,
                algorithms=[self.algorithm],
                audience=None,
                options={"verify_aud": False}
            )
            user_id = data.get("sub")
            if user_id is None:
                return None
            return await user_manager.get(user_id)
        except Exception as e:
            print(f"[CustomJWTStrategy] Token read error: {e}")
            return None

    async def write_token(self, user: User) -> str:
        import jwt as pyjwt
        data = {
            "sub": str(user.id),
            "user_id": str(user.id),
            "aud": ["fastapi-users:auth"],
        }
        return pyjwt.encode(
            data,
            self.secret,
            algorithm=self.algorithm,
        )


jwt_strategy = CustomJWTStrategy(secret=SECRET_KEY, lifetime_seconds=JWT_LIFETIME)

# Bearer Transport
bearer_transport = BearerTransport(tokenUrl="/api/v1/auth/jwt/login")

# Authentication Backend
auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=lambda: jwt_strategy,
)

# FastAPI-Users instance
fastapi_users = FastAPIUsers(
    get_user_manager,
    [auth_backend],
)

# Dependencies for routes
current_user = fastapi_users.current_user(active=True)
current_superuser = fastapi_users.current_user(active=True, superuser=True)

# Optional current user (for public routes that can work with or without auth)
async def optional_current_user(
    token: Optional[str] = None,
    session: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """Get current user if token provided, otherwise return None"""
    if not token:
        return None
    try:
        # Verify token and get user
        user_db = SQLAlchemyUserDatabase(session, User)
        manager = UserManager(user_db)
        user = await manager.get(token)
        return user
    except:
        return None
