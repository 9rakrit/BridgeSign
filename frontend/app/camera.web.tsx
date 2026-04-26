// Web-only real-time ASL recognition using MediaPipe HandLandmarker.
// Metro will pick this file over camera.tsx on the web platform.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

type Emotion = 'Happy' | 'Sad' | 'Angry' | 'Neutral' | 'Fear' | 'Surprise';

const EMOTION_META: Record<Emotion, { color: string; icon: any }> = {
  Happy: { color: '#34C759', icon: 'happy' },
  Neutral: { color: '#64D2FF', icon: 'ellipse' },
  Sad: { color: '#FF9500', icon: 'sad' },
  Angry: { color: '#FF3B30', icon: 'flame' },
  Fear: { color: '#FF453A', icon: 'warning' },
  Surprise: { color: '#AF52DE', icon: 'flash' },
};

// Geometric ASL classifier from 21 hand landmarks (MediaPipe Hands).
type LM = { x: number; y: number; z: number };
function classifyHand(lm: LM[]): string {
  if (!lm || lm.length < 21) return '';
  const dist = (a: LM, b: LM) => Math.hypot(a.x - b.x, a.y - b.y);
  const fingers = [
    { tip: 4, pip: 3, mcp: 2 },   // thumb
    { tip: 8, pip: 6, mcp: 5 },   // index
    { tip: 12, pip: 10, mcp: 9 }, // middle
    { tip: 16, pip: 14, mcp: 13 },// ring
    { tip: 20, pip: 18, mcp: 17 },// pinky
  ];
  const ext = fingers.map((f) => {
    const tipMcp = dist(lm[f.tip], lm[f.mcp]);
    const pipMcp = dist(lm[f.pip], lm[f.mcp]);
    return tipMcp > pipMcp * 1.25;
  });
  const [t, i, m, r, p] = ext;
  const handSize = dist(lm[0], lm[9]);
  const spreadIM = dist(lm[8], lm[12]) > handSize * 0.45;

  // Multi-finger word: 5 fingers open → HELLO (open palm wave)
  if (t && i && m && r && p) return 'HELLO';
  // Y: thumb + pinky out
  if (t && !i && !m && !r && p) return 'Y';
  // L: thumb + index, perpendicular
  if (t && i && !m && !r && !p) return 'L';
  // D: only index up
  if (!t && i && !m && !r && !p) return 'D';
  // U / V: index + middle
  if (!t && i && m && !r && !p) return spreadIM ? 'V' : 'U';
  // W: index + middle + ring
  if (!t && i && m && r && !p) return 'W';
  // B: 4 fingers up, thumb tucked
  if (!t && i && m && r && p) return 'B';
  // I: only pinky up
  if (!t && !i && !m && !r && p) return 'I';
  // A: closed fist (no extended fingers) or thumb only
  if (!i && !m && !r && !p) return 'A';
  return '';
}

export default function CameraWeb() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number>(0);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');

  const [currentLetter, setCurrentLetter] = useState<string>('');
  const [letterConf, setLetterConf] = useState<number>(0);
  const [sentence, setSentence] = useState<string>('');
  const [emotion, setEmotion] = useState<Emotion>('Neutral');
  const [emotionConf, setEmotionConf] = useState<number>(0);
  const [distress, setDistress] = useState(false);

  // Stability window — emit a letter to the sentence only when we've seen the same value for ~600ms
  const stabilityRef = useRef<{ letter: string; since: number; emitted: string }>({ letter: '', since: 0, emitted: '' });
  const sentenceLastWordRef = useRef<string>('');

  const confSV = useSharedValue(0);
  const emoSV = useSharedValue(0);

  useEffect(() => {
    confSV.value = withTiming(letterConf, { duration: 200 });
  }, [letterConf, confSV]);
  useEffect(() => {
    emoSV.value = withTiming(emotionConf, { duration: 300 });
  }, [emotionConf, emoSV]);

  // Initialize camera + MediaPipe
  useEffect(() => {
    let mounted = true;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera not available in this environment');
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!mounted) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const fileset = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
        );
        const lm = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          numHands: 1,
          runningMode: 'VIDEO',
        });
        landmarkerRef.current = lm;
        if (mounted) {
          setReady(true);
          requestAnimationFrame(loop);
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to initialise camera');
      }
    })();

    const loop = (ts: number) => {
      const v = videoRef.current;
      const c = canvasRef.current;
      const lmer = landmarkerRef.current;
      if (v && c && lmer && v.readyState >= 2) {
        if (ts - lastFrameTsRef.current >= 30) { // ~30 FPS cap
          lastFrameTsRef.current = ts;
          try {
            const result = lmer.detectForVideo(v, ts);
            const ctx = c.getContext('2d');
            if (ctx) {
              c.width = v.videoWidth || 640;
              c.height = v.videoHeight || 480;
              ctx.clearRect(0, 0, c.width, c.height);
              if (result.landmarks && result.landmarks.length > 0) {
                drawLandmarks(ctx, result.landmarks[0], c.width, c.height);
                const letter = classifyHand(result.landmarks[0] as any);
                const conf = letter ? 0.9 : 0.0;
                setCurrentLetter(letter);
                setLetterConf(conf);
                handleStability(letter);
              } else {
                setCurrentLetter('');
                setLetterConf(0);
                handleStability('');
              }
            }
          } catch {
            // ignore frame error
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close?.();
    };
  }, [facing]);

  // Stability + sentence builder
  const handleStability = (letter: string) => {
    const now = performance.now();
    const s = stabilityRef.current;
    if (letter !== s.letter) {
      s.letter = letter;
      s.since = now;
      return;
    }
    if (!letter) return;
    if (now - s.since < 600) return; // need 600ms stable
    if (s.emitted === letter && sentenceLastWordRef.current === letter) {
      // already emitted this; require a brief release before re-adding
      return;
    }
    s.emitted = letter;
    setSentence((prev) => {
      if (sentenceLastWordRef.current === letter) return prev;
      sentenceLastWordRef.current = letter;
      const next = prev ? prev + ' ' + letter : letter;
      return next;
    });
  };

  // Periodic emotion polling (every 2.5s) — uses backend Gemini.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const v = videoRef.current;
        const cap = captureCanvasRef.current;
        if (v && cap && v.videoWidth) {
          const w = 320;
          const h = Math.round((v.videoHeight / v.videoWidth) * w);
          cap.width = w;
          cap.height = h;
          const ctx = cap.getContext('2d');
          if (ctx) {
            ctx.drawImage(v, 0, 0, w, h);
            const dataUrl = cap.toDataURL('image/jpeg', 0.6);
            const b64 = dataUrl.split(',')[1];
            const resp = await fetch(`${BACKEND_URL}/api/analyze`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image_base64: b64 }),
            });
            if (resp.ok) {
              const data = await resp.json();
              if (!cancelled) {
                setEmotion((data.emotion as Emotion) || 'Neutral');
                setEmotionConf(Number(data.emotion_confidence || 0));
                setDistress(Boolean(data.distress));
              }
            }
          }
        }
      } catch { /* swallow */ }
    };
    const id = setInterval(tick, 2500);
    tick();
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const speak = () => {
    const txt = sentence.trim();
    if (!txt) return;
    Speech.stop();
    Speech.speak(txt, { rate: 0.95 });
  };

  const flip = () => setFacing((f) => (f === 'user' ? 'environment' : 'user'));

  const meta = EMOTION_META[emotion] || EMOTION_META.Neutral;

  const confidenceStyle = useAnimatedStyle(() => ({
    width: `${Math.round(confSV.value * 100)}%`,
  }));
  const emotionConfStyle = useAnimatedStyle(() => ({
    width: `${Math.round(emoSV.value * 100)}%`,
  }));

  return (
    <View style={styles.root} testID="camera-screen">
      {/* Native HTML video + overlay canvas (web only) */}
      {/* eslint-disable-next-line react/no-unknown-property */}
      <video
        ref={videoRef as any}
        autoPlay
        muted
        playsInline
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : 'none',
          // @ts-ignore
        } as any}
        data-testid="camera-preview"
      />
      <canvas
        ref={canvasRef as any}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: 'none', transform: facing === 'user' ? 'scaleX(-1)' : 'none',
          // @ts-ignore
        } as any}
      />
      <canvas ref={captureCanvasRef as any} style={{ display: 'none' } as any} />

      {!ready && !error && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#F8FAFC" />
          <Text style={styles.loadingText}>Loading on-device hand tracking…</Text>
        </View>
      )}
      {error && (
        <View style={styles.loadingOverlay}>
          <Ionicons name="warning" size={28} color="#F8FAFC" />
          <Text style={styles.loadingText}>{error}</Text>
        </View>
      )}

      {/* Top bar */}
      <View style={styles.topBar} pointerEvents="box-none">
        <View style={styles.topRow}>
          <TouchableOpacity testID="back-btn" style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#F8FAFC" />
          </TouchableOpacity>

          <Animated.View entering={FadeInDown.duration(300)} style={[styles.emotionBadge, { borderColor: meta.color + '88' }]} testID="emotion-badge">
            <View style={[styles.emotionDot, { backgroundColor: meta.color }]}>
              <Ionicons name={meta.icon} size={14} color="#0B1220" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.emotionLabel}>EMOTION</Text>
              <Text style={styles.emotionName}>{emotion}</Text>
              <View style={styles.confTrack}>
                <Animated.View style={[styles.confFill, { backgroundColor: meta.color }, emotionConfStyle]} />
              </View>
            </View>
            <Text style={styles.confPct}>{Math.round(emotionConf * 100)}%</Text>
          </Animated.View>

          <View style={styles.topRight}>
            <TouchableOpacity testID="history-btn" style={styles.iconBtn} onPress={() => router.push('/history')}>
              <Ionicons name="time-outline" size={22} color="#F8FAFC" />
            </TouchableOpacity>
            <TouchableOpacity testID="flip-camera-btn" style={styles.iconBtn} onPress={flip}>
              <Ionicons name="camera-reverse" size={22} color="#F8FAFC" />
            </TouchableOpacity>
          </View>
        </View>

        {distress && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.distress} testID="distress-alert-banner">
            <Ionicons name="alert-circle" size={20} color="#FFF" />
            <Text style={styles.distressText}>Distress signal detected — notify caregiver</Text>
          </Animated.View>
        )}
      </View>

      {/* Live letter HUD (big bold display of current letter as user signs) */}
      <View pointerEvents="none" style={styles.liveLetterWrap}>
        <Text style={styles.liveLetter} testID="live-letter">
          {currentLetter || '·'}
        </Text>
        <Text style={styles.liveHint}>{currentLetter ? 'detected live' : 'show your hand'}</Text>
      </View>

      {/* Bottom panel */}
      <View style={styles.bottomBar} pointerEvents="box-none">
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelLabel}>RECOGNISED TEXT</Text>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE · ON-DEVICE</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
            <Text style={styles.sentence} testID="recognized-text-output">{sentence || '—'}</Text>
          </ScrollView>

          <View style={styles.lastRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lastLabel}>CURRENT GESTURE</Text>
              <Text style={styles.lastValue}>{currentLetter || '—'}</Text>
              <View style={styles.confTrackDark}>
                <Animated.View style={[styles.confFill, { backgroundColor: '#F8FAFC' }, confidenceStyle]} />
              </View>
            </View>
            <Text style={styles.confPctLarge}>{Math.round(letterConf * 100)}%</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity testID="clear-text-button" style={styles.sideBtn} onPress={() => { setSentence(''); sentenceLastWordRef.current = ''; stabilityRef.current.emitted = ''; }}>
              <Ionicons name="close-circle" size={24} color="#F8FAFC" />
              <Text style={styles.sideBtnText}>Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="capture-frame-button"
              style={styles.captureBtn}
              activeOpacity={0.85}
              onPress={() => {
                // Manually commit current letter to sentence
                if (currentLetter) {
                  setSentence((prev) => {
                    sentenceLastWordRef.current = currentLetter;
                    return prev ? prev + ' ' + currentLetter : currentLetter;
                  });
                }
              }}
            >
              <Ionicons name="add" size={28} color="#0B1220" />
            </TouchableOpacity>

            <TouchableOpacity testID="tts-speak-button" style={styles.sideBtn} onPress={speak}>
              <Ionicons name="volume-high" size={24} color="#F8FAFC" />
              <Text style={styles.sideBtnText}>Speak</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// Draw 21 landmarks + 21 connecting bones onto the overlay canvas.
const HAND_BONES: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17],
];
function drawLandmarks(ctx: CanvasRenderingContext2D, lm: LM[], w: number, h: number) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(52, 199, 89, 0.95)';
  for (const [a, b] of HAND_BONES) {
    ctx.beginPath();
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
    ctx.stroke();
  }
  ctx.fillStyle = '#F8FAFC';
  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: 'rgba(11,18,32,0.85)', zIndex: 10,
  },
  loadingText: { color: '#F8FAFC', fontSize: 14, marginTop: 4 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: 12, paddingTop: 16 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  topRight: { flexDirection: 'row', gap: 8 },
  emotionBadge: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 16, borderWidth: 1,
  },
  emotionDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emotionLabel: { color: '#94A3B8', fontSize: 9, letterSpacing: 1.2, fontWeight: '700' },
  emotionName: { color: '#F8FAFC', fontSize: 15, fontWeight: '700', marginTop: 1 },
  confTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  confTrackDark: { height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  confFill: { height: '100%', borderRadius: 2 },
  confPct: { color: '#F8FAFC', fontSize: 11, fontWeight: '700', marginLeft: 4 },
  confPctLarge: { color: '#F8FAFC', fontSize: 20, fontWeight: '800', marginLeft: 10 },
  distress: {
    marginTop: 10, backgroundColor: '#FF3B30', padding: 12, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  distressText: { color: '#FFF', fontWeight: '700', flex: 1 },

  liveLetterWrap: {
    position: 'absolute', alignSelf: 'center', top: '38%',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 30, paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  liveLetter: { color: '#34C759', fontSize: 96, fontWeight: '900', letterSpacing: 2, lineHeight: 100 },
  liveHint: { color: '#94A3B8', fontSize: 11, letterSpacing: 1.4, fontWeight: '700', marginTop: 4 },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12 },
  panel: {
    borderRadius: 22, padding: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  panelLabel: { color: '#94A3B8', fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  livePill: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: 'rgba(52,199,89,0.18)', borderWidth: 1, borderColor: 'rgba(52,199,89,0.4)',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759' },
  liveText: { color: '#34C759', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  sentence: { color: '#F8FAFC', fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },
  lastRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  lastLabel: { color: '#94A3B8', fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  lastValue: { color: '#F8FAFC', fontSize: 18, fontWeight: '700', marginTop: 2 },

  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  sideBtn: {
    width: 72, height: 56, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  sideBtnText: { color: '#F8FAFC', fontSize: 10, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  captureBtn: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 4, borderColor: 'rgba(248,250,252,0.35)',
  },
});
