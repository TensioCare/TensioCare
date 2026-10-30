from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import DbSession, PatientUser
from app.models.device import Device
from app.models.patient import PatientProfile
from app.schemas.reading import DeviceCreate, DeviceRead

router = APIRouter(prefix="/patients/me/devices", tags=["devices"])


def _patient_profile(user: PatientUser) -> PatientProfile:
    profile = user.patient_profile
    assert profile is not None
    return profile


@router.post("", response_model=DeviceRead, status_code=status.HTTP_201_CREATED)
def register_device(
    payload: DeviceCreate, current_user: PatientUser, db: DbSession
) -> Device:
    """Pair a blood pressure monitor; its serial is used when posting readings."""
    patient = _patient_profile(current_user)

    if db.scalar(
        select(Device.id).where(Device.serial_number == payload.serial_number)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This device serial number is already registered",
        )

    device = Device(
        serial_number=payload.serial_number,
        label=payload.label,
        model=payload.model,
        patient_id=patient.id,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.get("", response_model=list[DeviceRead])
def list_devices(current_user: PatientUser, db: DbSession) -> list[Device]:
    devices = db.scalars(
        select(Device)
        .where(Device.patient_id == _patient_profile(current_user).id)
        .order_by(Device.id)
    )
    return list(devices)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(device_id: int, current_user: PatientUser, db: DbSession) -> None:
    device = db.get(Device, device_id)
    if device is None or device.patient_id != _patient_profile(current_user).id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device {device_id} not found",
        )
    db.delete(device)
    db.commit()
