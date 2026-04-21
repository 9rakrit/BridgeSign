from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import re
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------------- Models ----------------
class AnalyzeRequest(BaseModel):
    image_base64: str
    session_id: Optional[str] = None

class AnalyzeResponse(BaseModel):
    id: str
    gesture_text: str
    gesture_confidence: float
    emotion: str
    emotion_confidence: float
    distress: bool
    raw: Optional[str] = None
    created_at: str

class HistoryItem(BaseModel):
    id: str
    gesture_text: str
    gesture_confidence: float
    emotion: str
    emotion_confidence: float
    distress: bool
    created_at: str

# Allowed vocabularies (returned in prompt)
ASL_LETTERS = [chr(c) for c in range(ord('A'), ord('Z') + 1)]
ASL_WORDS = ["HELLO", "HELP", "THANK YOU", "YES", "NO", "I LOVE YOU"]
EMOTIONS = ["Happy", "Sad", "Angry", "Neutral", "Fear", "Surprise"]

SYSTEM_PROMPT = f"""You are an expert computer-vision assistant for an assistive communication app
that helps non-verbal and speech-impaired users. You will be given ONE image frame captured from a
mobile phone camera. In that image there may be:
  1. A person showing an American Sign Language (ASL) hand gesture.
  2. A face showing an emotion.

Your job is to analyse the image and return a STRICT JSON object (no prose, no code fences) with
exactly these keys:
{{
  "gesture_text": string,      // one of the ASL letters A-Z, or one of {ASL_WORDS}, or "" if no hand/gesture visible
  "gesture_confidence": number, // 0.0 - 1.0
  "emotion": string,            // one of {EMOTIONS}, or "Neutral" if no face visible
  "emotion_confidence": number, // 0.0 - 1.0
  "distress": boolean           // true if the user appears to be in distress (Sad/Fear/Angry + HELP-like gesture, or clearly panicked face)
}}

Rules:
- Only return JSON. No extra text. No markdown. No backticks.
- If the image is blurry, dark, or no hand/face is visible, still return the JSON with sensible defaults and confidence reflecting uncertainty.
- Prefer word-level recognition ("HELP", "HELLO", "THANK YOU") when the gesture clearly matches; otherwise output the single ASL letter.
- Do NOT diagnose any medical condition.
"""


def _parse_json(text: str) -> dict:
    # Strip code fences if present
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    # Extract first {...} block
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in model response")
    return json.loads(match.group(0))


def _clamp01(v) -> float:
    try:
        f = float(v)
    except Exception:
        return 0.0
    return max(0.0, min(1.0, f))


# ---------------- Routes ----------------
@api_router.get("/")
async def root():
    return {"message": "Emotion-Aware Sign Language API", "status": "ok"}


@api_router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_frame(req: AnalyzeRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
    if not req.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 is required")

    # Strip data URL prefix if present
    b64 = req.image_base64
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[-1]

    session_id = req.session_id or str(uuid.uuid4())

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=SYSTEM_PROMPT,
        ).with_model("gemini", "gemini-2.5-flash")

        image = ImageContent(image_base64=b64)
        user_message = UserMessage(
            text="Analyse this frame. Return the required strict JSON only.",
            file_contents=[image],
        )
        response_text = await chat.send_message(user_message)
        logger.info(f"Model raw response: {response_text[:300]}")

        parsed = _parse_json(response_text if isinstance(response_text, str) else str(response_text))
    except Exception as e:
        logger.exception("Analyze failed")
        raise HTTPException(status_code=500, detail=f"Analysis error: {e}")

    gesture_text = str(parsed.get("gesture_text", "") or "").strip().upper()
    emotion = str(parsed.get("emotion", "Neutral") or "Neutral").strip().capitalize()
    if emotion not in EMOTIONS:
        emotion = "Neutral"
    gesture_confidence = _clamp01(parsed.get("gesture_confidence", 0))
    emotion_confidence = _clamp01(parsed.get("emotion_confidence", 0))
    distress = bool(parsed.get("distress", False))

    record = {
        "id": str(uuid.uuid4()),
        "gesture_text": gesture_text,
        "gesture_confidence": gesture_confidence,
        "emotion": emotion,
        "emotion_confidence": emotion_confidence,
        "distress": distress,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        await db.recognitions.insert_one({**record})
    except Exception:
        logger.exception("Failed to save recognition history")

    return AnalyzeResponse(**record, raw=response_text if isinstance(response_text, str) else None)


@api_router.get("/history", response_model=List[HistoryItem])
async def get_history(limit: int = 50):
    cursor = db.recognitions.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [HistoryItem(**d) for d in docs]


@api_router.delete("/history")
async def clear_history():
    result = await db.recognitions.delete_many({})
    return {"deleted": result.deleted_count}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
