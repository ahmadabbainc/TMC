from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="The API service for TMC, the AI Shorts Factory.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(api_router)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    """Lightweight health check for deployment and uptime monitoring."""
    return {
        "status": "ok",
        "service": "tmc-api",
        "environment": settings.app_env,
    }
