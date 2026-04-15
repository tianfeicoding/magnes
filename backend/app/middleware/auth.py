"""
Authentication middleware for unified 401 handling
"""
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Unified authentication middleware:
    - Public routes: allow guest access
    - Protected routes: return 401, frontend shows login modal
    """

    # Public routes whitelist (no auth required)
    PUBLIC_PATHS = [
        "/",                    # Home
        "/docs", "/openapi.json",  # API docs
        "/magnes",              # Frontend
        "/auth/jwt/login",      # Login
        "/auth/jwt/register",   # Register
        "/auth/quick-register", # Quick register
        "/api/v1/auth/jwt/login",
        "/api/v1/auth/jwt/register",
        "/api/v1/auth/quick-register",
    ]

    # Public GET endpoints
    PUBLIC_GET_ENDPOINTS = [
        "/api/v1/templates",
        "/api/v1/rag/documents",
        "/api/v1/rag/stats",
        "/api/v1/rag/knowledge/documents",
    ]

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method

        # Check if it's a public route
        if any(path.startswith(p) for p in self.PUBLIC_PATHS):
            return await call_next(request)

        # Check if it's a public GET endpoint
        if method == "GET":
            for endpoint in self.PUBLIC_GET_ENDPOINTS:
                if path.startswith(endpoint):
                    return await call_next(request)

        # Static assets
        if path.startswith(("/js/", "/css/", "/src/", "/uploads/", "/core/", "/.well-known/")):
            return await call_next(request)

        # All other routes require authentication
        auth_header = request.headers.get("Authorization")
        print(f"[AuthMiddleware] Path: {path}, Auth header present: {bool(auth_header)}")
        if not auth_header or not auth_header.startswith("Bearer "):
            print(f"[AuthMiddleware] Missing or invalid auth header for {path}")
            return JSONResponse(
                status_code=401,
                content={
                    "code": "LOGIN_REQUIRED",
                    "message": "请先登录或注册",
                    "detail": "该操作需要登录后才能执行"
                }
            )

        # Has auth header, let FastAPI handle validation
        print(f"[AuthMiddleware] Has auth header, proceeding to route: {path}")
        response = await call_next(request)
        print(f"[AuthMiddleware] Response status for {path}: {response.status_code}")
        return response
