from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    PatientRegister,
    RefreshRequest,
    Token,
)
from app.schemas.user import (
    CaregiverCodeLogin,
    CaregiverCodePreview,
    UserRead,
)
from app.services.caregivers import login_with_code
from app.services.caregivers import preview as preview_caregiver_code
from app.services.tokens import (
    issue_refresh_token,
    revoke_refresh_token,
    rotate_refresh_token,
)
from app.services.users import authenticate_user, get_user_by_id, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_response(user: User, refresh_token: str) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user.id),
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserRead.model_validate(user),
    )


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a patient account",
)
def register(payload: PatientRegister, db: DbSession) -> AuthResponse:
    """Accounts are always patients; caregivers join with a patient's code."""
    user = register_user(payload, db)
    return _auth_response(user, issue_refresh_token(db, user.id))


@router.post("/login", response_model=AuthResponse, summary="Patient login")
def login(payload: LoginRequest, db: DbSession) -> AuthResponse:
    user = authenticate_user(db, payload.email, payload.password)
    return _auth_response(user, issue_refresh_token(db, user.id))


@router.post(
    "/caregiver/login",
    response_model=AuthResponse,
    summary="Caregiver login with the code shared by the patient",
)
def caregiver_login(payload: CaregiverCodeLogin, db: DbSession) -> AuthResponse:
    """First use activates the caregiver account; later uses sign it back in."""
    user = login_with_code(db, payload.code)
    return _auth_response(user, issue_refresh_token(db, user.id))


@router.get(
    "/caregiver-codes/{code}",
    response_model=CaregiverCodePreview,
    summary="Preview who a caregiver code belongs to",
)
def show_caregiver_code(code: str, db: DbSession) -> CaregiverCodePreview:
    profile = preview_caregiver_code(db, code)
    if not profile.links:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invalid caregiver code"
        )
    link = profile.links[0]
    return CaregiverCodePreview(
        patient_first_name=link.patient.user.first_name,
        patient_last_name=link.patient.user.last_name,
        caregiver_first_name=profile.user.first_name,
        caregiver_last_name=profile.user.last_name,
        relationship=profile.relationship,
        claimed=profile.claimed_at is not None,
    )


@router.post(
    "/refresh",
    response_model=AuthResponse,
    summary="Exchange a refresh token for a new access token",
)
def refresh(payload: RefreshRequest, db: DbSession) -> AuthResponse:
    """Single-use rotation: the old refresh token stops working immediately."""
    user_id, new_refresh_token = rotate_refresh_token(db, payload.refresh_token)
    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _auth_response(user, new_refresh_token)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a refresh token (sign out)",
)
def logout(payload: RefreshRequest, db: DbSession) -> None:
    revoke_refresh_token(db, payload.refresh_token)


@router.post(
    "/token",
    response_model=Token,
    summary="OAuth2 form login (used by the Swagger UI Authorize button)",
)
def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSession,
) -> Token:
    user = authenticate_user(db, form_data.username, form_data.password)
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserRead, summary="Current user with profile")
def read_current_user(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)
