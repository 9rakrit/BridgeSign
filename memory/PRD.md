# SignSense — Emotion-Aware Sign Language Communication System

## Summary
A React Native (Expo) mobile app that uses the device camera + Gemini 2.5 Pro vision (via Emergent LLM Key) to simultaneously recognise ASL hand gestures (A–Z, HELP, HELLO, THANK YOU) and detect facial emotion (Happy, Sad, Angry, Neutral, Fear, Surprise) with confidence scores, helping non-verbal and speech-impaired users communicate.

## Architecture
- Frontend: Expo SDK 54, expo-router, expo-camera, expo-speech, expo-blur, expo-linear-gradient, reanimated
- Backend: FastAPI + emergentintegrations `LlmChat` with Gemini 2.5 Pro (vision)
- DB: MongoDB (recognition history)

## Endpoints (prefix /api)
- `GET /api/` – health
- `POST /api/analyze` – body `{image_base64}` → `{gesture_text, gesture_confidence, emotion, emotion_confidence, distress, id, created_at}`
- `GET /api/history?limit=50` – recent recognitions
- `DELETE /api/history` – clear history

## Screens
- `/` Onboarding — hero, features, Get Started
- `/camera` Live camera + emotion badge + recognised-text sentence builder + capture/auto/TTS
- `/history` Past recognitions list
- `/settings` Toggles: auto-analyze, TTS, caregiver alerts

## Key Env
- `EMERGENT_LLM_KEY` in `/app/backend/.env`
- `EXPO_PUBLIC_BACKEND_URL` in `/app/frontend/.env`

## Notes
- Not a medical device; assistive only.
- Latency: each analyse call ≈ 1–3s (Gemini vision).
