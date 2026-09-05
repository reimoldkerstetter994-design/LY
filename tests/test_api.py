from fastapi.testclient import TestClient

from njau_are.web import app

client = TestClient(app)


def test_home_and_snapshot():
    home = client.get("/")
    assert home.status_code == 200
    assert "农业资源与环境" in home.text
    snap = client.get("/api/snapshot")
    assert snap.status_code == 200
    data = snap.json()
    codes = {p["code"] for p in data["programs"]}
    assert "090301" in codes
    assert "090302" in codes
    assert data["guides"]
    assert data["scores"]
