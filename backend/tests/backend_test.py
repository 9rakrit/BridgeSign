"""Backend tests for Emotion-Aware Sign Language API"""
import os
import base64
import time
import pytest
import requests
from pathlib import Path

BASE_URL = "https://asl-mood-chat.preview.emergentagent.com"

# Use a realistic JPEG of a face/hand. Download a tiny real JPG from pexels.
IMG_URL = "https://images.pexels.com/photos/3760607/pexels-photo-3760607.jpeg?auto=compress&cs=tinysrgb&w=480&h=480&dpr=1"


@pytest.fixture(scope="session")
def face_b64():
    r = requests.get(IMG_URL, timeout=30)
    r.raise_for_status()
    assert r.content[:3] == b"\xff\xd8\xff", "not a JPEG"
    return base64.b64encode(r.content).decode()


# --- Health ---
def test_root_ok():
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j.get("status") == "ok"


# --- Analyze ---
def test_analyze_missing_image():
    r = requests.post(f"{BASE_URL}/api/analyze", json={"image_base64": ""}, timeout=30)
    assert r.status_code in (400, 422)


def test_analyze_success_and_persist(face_b64):
    # Clear first
    requests.delete(f"{BASE_URL}/api/history", timeout=15)

    r = requests.post(
        f"{BASE_URL}/api/analyze",
        json={"image_base64": face_b64},
        timeout=120,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ["id", "gesture_text", "gesture_confidence", "emotion",
              "emotion_confidence", "distress", "created_at"]:
        assert k in data, f"missing {k}"
    assert isinstance(data["gesture_confidence"], (int, float))
    assert 0.0 <= data["gesture_confidence"] <= 1.0
    assert 0.0 <= data["emotion_confidence"] <= 1.0
    assert data["emotion"] in ["Happy", "Sad", "Angry", "Neutral", "Fear", "Surprise"]
    assert isinstance(data["distress"], bool)

    # verify persisted
    time.sleep(0.5)
    h = requests.get(f"{BASE_URL}/api/history", timeout=15)
    assert h.status_code == 200
    arr = h.json()
    assert isinstance(arr, list)
    assert any(it["id"] == data["id"] for it in arr)


# --- History ---
def test_history_list_and_clear():
    r = requests.get(f"{BASE_URL}/api/history", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    d = requests.delete(f"{BASE_URL}/api/history", timeout=15)
    assert d.status_code == 200
    assert "deleted" in d.json()

    r2 = requests.get(f"{BASE_URL}/api/history", timeout=15)
    assert r2.status_code == 200
    assert r2.json() == []
