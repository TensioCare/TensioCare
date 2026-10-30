from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.api.deps import CurrentUser, DbSession, PatientUser
from app.models.patient import PatientProfile
from app.schemas.reading import (
    ReadingAnalysis,
    ReadingCreate,
    ReadingRead,
    ReadingUpdate,
)
from app.services.monitoring import (
    analyse_readings,
    create_reading,
    delete_reading,
    get_latest_reading,
    list_readings,
    readings_csv,
    update_reading,
)

router = APIRouter(prefix="/patients/me/readings", tags=["readings"])


def _patient_profile(user: CurrentUser) -> PatientProfile:
    profile = user.patient_profile
    assert profile is not None
    return profile


@router.post("", response_model=ReadingRead, status_code=status.HTTP_201_CREATED)
def add_reading(
    payload: ReadingCreate, current_user: PatientUser, db: DbSession
) -> ReadingRead:
    """Store a reading, either synced from a paired device or entered manually."""
    reading = create_reading(db, _patient_profile(current_user), payload)
    return ReadingRead.model_validate(reading)


@router.get("", response_model=list[ReadingRead])
def read_readings(
    current_user: PatientUser,
    db: DbSession,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[ReadingRead]:
    readings = list_readings(
        db,
        _patient_profile(current_user).id,
        start=start,
        end=end,
        limit=limit,
        offset=offset,
    )
    return [ReadingRead.model_validate(reading) for reading in readings]


@router.get("/latest", response_model=ReadingRead)
def read_latest_reading(current_user: PatientUser, db: DbSession) -> ReadingRead:
    reading = get_latest_reading(db, _patient_profile(current_user).id)
    if reading is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No readings recorded yet"
        )
    return ReadingRead.model_validate(reading)


@router.get("/analysis", response_model=ReadingAnalysis)
def analyse_my_readings(
    current_user: PatientUser,
    db: DbSession,
    days: int = Query(default=7, ge=1, le=365),
) -> ReadingAnalysis:
    """Averages, category breakdown, target compliance, trend and alerts."""
    return analyse_readings(db, _patient_profile(current_user), days)


@router.get(
    "/export.csv",
    response_class=Response,
    summary="Download my readings as CSV",
)
def export_my_readings(
    current_user: PatientUser,
    db: DbSession,
    start: datetime | None = None,
    end: datetime | None = None,
) -> Response:
    content = readings_csv(db, _patient_profile(current_user).id, start, end)
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="readings.csv"'},
    )


@router.patch(
    "/{reading_id}",
    response_model=ReadingRead,
    summary="Correct a reading",
)
def edit_reading(
    reading_id: int,
    payload: ReadingUpdate,
    current_user: PatientUser,
    db: DbSession,
) -> ReadingRead:
    reading = update_reading(db, _patient_profile(current_user).id, reading_id, payload)
    return ReadingRead.model_validate(reading)


@router.delete(
    "/{reading_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a reading",
)
def remove_reading(reading_id: int, current_user: PatientUser, db: DbSession) -> None:
    delete_reading(db, _patient_profile(current_user).id, reading_id)
