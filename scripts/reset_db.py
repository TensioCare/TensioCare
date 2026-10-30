"""Drop and recreate every table, then exit.

Run it after changing models (there are no migrations yet). It deletes all
data, so use it only on a development database:

    .\\.venv\\Scripts\\python.exe scripts\\reset_db.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402

with engine.begin() as conn:
    conn.execute(text("DROP SCHEMA public CASCADE"))
    conn.execute(text("CREATE SCHEMA public"))

Base.metadata.create_all(engine)

with engine.connect() as conn:
    rows = conn.execute(
        text(
            "select table_name from information_schema.tables "
            "where table_schema = 'public' order by 1"
        )
    ).all()
    print(f"recreated {len(rows)} tables")
    print(", ".join(row[0] for row in rows))
