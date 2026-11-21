import secrets

from fastapi import Header, HTTPException, status

from app.core.config import get_settings


async def require_api_token(authorization: str | None = Header(default=None)) -> None:
    """Protect internal API routes until end-user authentication is integrated."""
    configured_token = get_settings().api_token
    if not configured_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API authentication is not configured.",
        )

    scheme, _, supplied_token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(
        supplied_token, configured_token
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid bearer token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
