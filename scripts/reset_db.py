"""Drop the schema and rebuild it through Alembic.

This is destructive and meant for development only:

    .\\.venv\\Scripts\\python.exe scripts\\reset_db.py

Use ``alembic upgrade head`` instead when you only need to apply new migrations.
"""

import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402

if engine.dialect.name == "sqlite":
    Base.metadata.drop_all(engine)
    # The version table is not part of Base.metadata; remove it so Alembic
    # replays the migrations instead of thinking the schema is already current.
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
else:
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))

config = Config(str(ROOT / "alembic.ini"))
config.set_main_option("script_location", str(ROOT / "alembic"))
config.set_main_option("prepend_sys_path", str(ROOT))
command.upgrade(config, "head")

with engine.connect() as conn:
    if engine.dialect.name == "sqlite":
        rows = conn.execute(
            text(
                "select name from sqlite_master "
                "where type = 'table' and name not like 'sqlite_%' order by 1"
            )
        ).all()
    else:
        rows = conn.execute(
            text(
                "select table_name from information_schema.tables "
                "where table_schema = 'public' order by 1"
            )
        ).all()

print(f"recreated {len(rows)} tables")
print(", ".join(row[0] for row in rows))
