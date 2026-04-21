import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Alert, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

type Emotion = 'Happy' | 'Sad' | 'Angry' | 'Neutral' | 'Fear' | 'Surprise';

type AnalyzeResult = {
  id: string;
  gesture_text: string;
  gesture_confidence: number;
  emotion: Emotion;
  emotion_confidence: number;
  distress: boolean;
  created_at: string;
};

const EMOTION_META: Record<Emotion, { color: string; icon: any }> = {
  Happy: { color: '#34C759', icon: 'happy' },
  Neutral: { color: '#64D2FF', icon: 'ellipse' },
  Sad: { color: '#FF9500', icon: 'sad' },
  Angry: { color: '#FF3B30', icon: 'flame' },
  Fear: { color: '#FF453A', icon: 'warning' },
  Surprise: { color: '#AF52DE', icon: 'flash' },
};

export default function CameraHome() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const cameraRef = useRef<CameraView | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const inFlightRef = useRef(false);
  const [autoMode, setAutoMode] = useState(true);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [sentence, setSentence] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const confidence = useSharedValue(0);
  const emotionConf = useSharedValue(0);
  const autoRef = useRef<any>(null);

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (result) {
      confidence.value = withTiming(result.gesture_confidence, { duration: 500 });
      emotionConf.value = withTiming(result.emotion_confidence, { duration: 500 });
    }
  }, [result, confidence, emotionConf]);

  const captureAndAnalyze = useCallback(async () => {
    if (!cameraRef.current) return;
    if (inFlightRef.current) return; // skip if one is in flight
    try {
      inFlightRef.current = true;
      setAnalyzing(true);
      setErrorMsg(null);
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.2,
        skipProcessing: true,
        shutterSound: false as any,
      });
      if (!photo?.base64) {
        throw new Error('Could not capture frame');
      }
      const resp = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: photo.base64 }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || `HTTP ${resp.status}`);
      }
      const data: AnalyzeResult = await resp.json();
      setResult(data);
      if (data.gesture_text && data.gesture_text.trim() && data.gesture_confidence >= 0.5) {
        setSentence((prev) => {
          const word = data.gesture_text.trim();
          if (!prev) return word;
          const tokens = prev.split(' ');
          if (tokens[tokens.length - 1] === word) return prev;
          return prev + ' ' + word;
        });
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Analysis failed');
    } finally {
      setAnalyzing(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (autoMode) {
      // Fire immediately, then every 800ms (inFlight guard prevents overlap)
      captureAndAnalyze();
      autoRef.current = setInterval(() => {
        captureAndAnalyze();
      }, 1500);
    } else if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
    }
    return () => {
      if (autoRef.current) clearInterval(autoRef.current);
    };
  }, [autoMode, captureAndAnalyze]);

  const speak = () => {
    const text = sentence.trim();
    if (!text) return;
    Speech.stop();
    Speech.speak(text, { rate: 0.95, pitch: 1.0 });
  };

  const clearSentence = () => setSentence('');

  const flip = () => setFacing((f) => (f === 'front' ? 'back' : 'front'));

  const confidenceStyle = useAnimatedStyle(() => ({
    width: `${Math.round(confidence.value * 100)}%`,
  }));
  const emotionConfStyle = useAnimatedStyle(() => ({
    width: `${Math.round(emotionConf.value * 100)}%`,
  }));

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: '#0B1220' }]}>
        <ActivityIndicator color="#F8FAFC" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: '#0B1220', padding: 24 }]}>
        <Ionicons name="camera-outline" size={60} color="#F8FAFC" />
        <Text style={styles.permTitle}>Camera access required</Text>
        <Text style={styles.permText}>
          SignSense needs camera access to recognise gestures and facial expressions. No video is recorded.
        </Text>
        <TouchableOpacity
          testID="grant-camera-permission"
          style={styles.permBtn}
          onPress={async () => {
            const r = await requestPermission();
            if (!r.granted && Platform.OS !== 'web') {
              Alert.alert('Permission needed', 'Please enable camera in Settings.');
            }
          }}
        >
          <Text style={styles.permBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const emotion = result?.emotion ?? 'Neutral';
  const meta = EMOTION_META[emotion];

  return (
    <View style={styles.root} testID="camera-screen">
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        testID="camera-preview"
      />

      {/* Top bar */}
      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <View style={styles.topRow}>
          <TouchableOpacity
            testID="back-btn"
            style={styles.iconBtn}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={22} color="#F8FAFC" />
          </TouchableOpacity>

          {/* Emotion badge */}
          <Animated.View entering={FadeInDown.duration(400)} style={[styles.emotionBadge, { borderColor: meta.color + '88' }]} testID="emotion-badge">
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
            <Text style={styles.confPct}>
              {Math.round((result?.emotion_confidence ?? 0) * 100)}%
            </Text>
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

        {result?.distress && (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.distress} testID="distress-alert-banner">
            <Ionicons name="alert-circle" size={20} color="#FFF" />
            <Text style={styles.distressText}>Distress signal detected — notify caregiver</Text>
          </Animated.View>
        )}
      </SafeAreaView>

      {/* Bottom panel */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar} pointerEvents="box-none">
        <BlurView intensity={40} tint="dark" style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelLabel}>RECOGNISED TEXT</Text>
            <TouchableOpacity
              testID="auto-toggle"
              onPress={() => setAutoMode((a) => !a)}
              style={[styles.autoPill, autoMode && { backgroundColor: '#34C759' }]}
            >
              <Ionicons name={autoMode ? 'pulse' : 'pause'} size={12} color={autoMode ? '#0B1220' : '#F8FAFC'} />
              <Text style={[styles.autoText, autoMode && { color: '#0B1220' }]}>{autoMode ? 'AUTO' : 'MANUAL'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 4 }}
          >
            <Text style={styles.sentence} testID="recognized-text-output">
              {sentence || '—'}
            </Text>
          </ScrollView>

          {/* Last gesture + confidence */}
          <View style={styles.lastRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lastLabel}>LAST GESTURE</Text>
              <Text style={styles.lastValue}>
                {result?.gesture_text ? result.gesture_text : '—'}
              </Text>
              <View style={styles.confTrackDark}>
                <Animated.View style={[styles.confFill, { backgroundColor: '#F8FAFC' }, confidenceStyle]} />
              </View>
            </View>
            <Text style={styles.confPctLarge}>
              {Math.round((result?.gesture_confidence ?? 0) * 100)}%
            </Text>
          </View>

          {errorMsg && (
            <Animated.View entering={FadeInUp} style={styles.errorBox}>
              <Ionicons name="warning-outline" size={14} color="#FCA5A5" />
              <Text style={styles.errorText} numberOfLines={2}>{errorMsg}</Text>
            </Animated.View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity testID="clear-text-button" style={styles.sideBtn} onPress={clearSentence}>
              <Ionicons name="close-circle" size={24} color="#F8FAFC" />
              <Text style={styles.sideBtnText}>Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="capture-frame-button"
              style={[styles.captureBtn, analyzing && { opacity: 0.6 }]}
              onPress={captureAndAnalyze}
              disabled={analyzing}
              activeOpacity={0.85}
            >
              {analyzing ? (
                <ActivityIndicator color="#0B1220" />
              ) : (
                <Ionicons name="scan" size={28} color="#0B1220" />
              )}
            </TouchableOpacity>

            <TouchableOpacity testID="tts-speak-button" style={styles.sideBtn} onPress={speak}>
              <Ionicons name="volume-high" size={24} color="#F8FAFC" />
              <Text style={styles.sideBtnText}>Speak</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '700', marginTop: 16 },
  permText: { color: '#94A3B8', textAlign: 'center', marginTop: 8, fontSize: 14, lineHeight: 20 },
  permBtn: {
    marginTop: 24, backgroundColor: '#F8FAFC', paddingHorizontal: 24, height: 56,
    borderRadius: 28, alignItems: 'center', justifyContent: 'center', minWidth: 240,
  },
  permBtnText: { color: '#0B1220', fontSize: 16, fontWeight: '700' },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: 12 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  topRight: { flexDirection: 'row', gap: 8 },

  emotionBadge: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 16, borderWidth: 1,
  },
  emotionDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  emotionLabel: { color: '#94A3B8', fontSize: 9, letterSpacing: 1.2, fontWeight: '700' },
  emotionName: { color: '#F8FAFC', fontSize: 15, fontWeight: '700', marginTop: 1 },
  confTrack: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginTop: 6, overflow: 'hidden',
  },
  confTrackDark: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginTop: 6, overflow: 'hidden',
  },
  confFill: { height: '100%', borderRadius: 2 },
  confPct: { color: '#F8FAFC', fontSize: 11, fontWeight: '700', marginLeft: 4 },
  confPctLarge: { color: '#F8FAFC', fontSize: 20, fontWeight: '800', marginLeft: 10 },

  distress: {
    marginTop: 10, backgroundColor: '#FF3B30', padding: 12, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  distressText: { color: '#FFF', fontWeight: '700', flex: 1 },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: {
    marginHorizontal: 12, marginBottom: 12,
    borderRadius: 22, padding: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  panelLabel: { color: '#94A3B8', fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },
  autoPill: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  autoText: { color: '#F8FAFC', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  sentence: { color: '#F8FAFC', fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },

  lastRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  lastLabel: { color: '#94A3B8', fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  lastValue: { color: '#F8FAFC', fontSize: 18, fontWeight: '700', marginTop: 2 },

  errorBox: {
    marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 8, borderRadius: 10,
    backgroundColor: 'rgba(220,38,38,0.18)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.35)',
  },
  errorText: { color: '#FCA5A5', fontSize: 12, flex: 1 },

  actions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 16,
  },
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
