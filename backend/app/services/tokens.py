import hashlib
import secrets
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutils import to_naive_utc, utcnow
from app.models.refresh_token import RefreshToken
from app.models.user import User

REFRESH_TOKEN_BYTES = 48


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _new_raw_token() -> str:
    return secrets.token_urlsafe(REFRESH_TOKEN_BYTES)


def issue_refresh_token(db: Session, user_id: int) -> str:
    """Create a fresh refresh token for the user and return the raw value once."""
    token = _new_raw_token()
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=_hash(token),
            expires_at=utcnow() + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    db.commit()
    return token


def _invalid_refresh_token() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _lookup(db: Session, token: str) -> RefreshToken:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash(token)))
    if row is None:
        raise _invalid_refresh_token()
    if row.revoked_at is not None or to_naive_utc(row.expires_at) <= utcnow():
        raise _invalid_refresh_token()
    return row


def rotate_refresh_token(db: Session, token: str) -> tuple[int, str]:
    """Exchange a valid refresh token for a new one, revoking the old value.

    Returns ``(user_id, new_raw_refresh_token)``. Tokens are single-use: replaying
    an already rotated token fails with 401, which surfaces leaked tokens.
    """
    row = _lookup(db, token)
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise _invalid_refresh_token()

    row.revoked_at = utcnow()
    new_token = _new_raw_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=_hash(new_token),
            expires_at=utcnow() + timedelta(days=settings.refresh_token_expire_days),
        )
    )

    # Housekeeping: drop this user's dead tokens so the table stays small.
    existing = db.scalars(
        select(RefreshToken).where(RefreshToken.user_id == user.id)
    ).all()
    for item in existing:
        dead = item.revoked_at is not None or to_naive_utc(item.expires_at) <= utcnow()
        if dead and item is not row:
            db.delete(item)

    db.commit()
    return user.id, new_token


def revoke_refresh_token(db: Session, token: str) -> None:
    """Revoke a refresh token if it exists. Safe to call repeatedly."""
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash(token)))
    if row is not None and row.revoked_at is None:
        row.revoked_at = utcnow()
        db.commit()
