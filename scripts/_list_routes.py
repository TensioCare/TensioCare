from fastapi.testclient import TestClient

from app.main import app

with TestClient(app) as client:
    spec = client.get("/openapi.json").json()

for path, ops in sorted(spec["paths"].items()):
    for method, op in ops.items():
        print(f"{method.upper():6} {path:62} {op.get('summary', '')}")
