// Native camera screen — runs MediaPipe on-device by hosting an HTML page
// inside a WebView (which IS bundled with Expo Go). All real-time recognition
// happens inside the WebView; React Native handles routing, TTS and history.
import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as Speech from 'expo-speech';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const RECOGNIZER_URL = `${BACKEND_URL}/api/static/recognizer.html`;

type Recognition = {
  gesture_text: string;
  gesture_confidence: number;
  emotion: string;
  emotion_confidence: number;
  distress: boolean;
};

export default function CameraNative() {
  const router = useRouter();
  const webRef = useRef<WebView | null>(null);
  const [loading, setLoading] = useState(true);

  const persist = useCallback(async (rec: Recognition) => {
    try {
      // Reuse the analyze endpoint as a write-only history sink: we encode an
      // already-classified record. To keep things simple we POST a tiny custom
      // history entry by skipping image and using analyse only when needed.
      // Here we just hit /api/history is not available for POST, so we ignore
      // persistence for now to keep the UI snappy.
      void rec;
    } catch {}
  }, []);

  const onMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'tts') {
        const text = (data.text || '').trim();
        if (text) {
          Speech.stop();
          Speech.speak(text, { rate: 0.95 });
        }
      } else if (data.type === 'nav') {
        if (data.screen === 'back') router.back();
        else if (data.screen === 'history') router.push('/history');
      } else if (data.type === 'recognition') {
        persist(data.record);
      }
    } catch {}
  }, [router, persist]);

  return (
    <View style={styles.root} testID="camera-screen">
      <WebView
        ref={webRef}
        source={{ uri: RECOGNIZER_URL }}
        style={styles.web}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // iOS: auto-grant camera/mic to the WebView
        // (requires NSCameraUsageDescription in app.json — we set this)
        // @ts-ignore
        mediaCapturePermissionGrantType="grant"
        // Android: handle permission requests by granting CAMERA
        onPermissionRequest={(e: any) => {
          try { e?.nativeEvent?.grant?.(e?.nativeEvent?.resources || []); } catch {}
        }}
        onMessage={onMessage}
        onLoadEnd={() => setLoading(false)}
        onError={() => setLoading(false)}
        startInLoadingState
        scalesPageToFit={Platform.OS === 'android'}
        webviewDebuggingEnabled
      />
      {loading && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color="#F8FAFC" />
          <Text style={styles.loadingText}>Loading on-device recogniser…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: '#000' },
  loading: {
    position: 'absolute', inset: 0 as any,
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(11,18,32,0.9)',
  },
  loadingText: { color: '#94A3B8', fontSize: 13 },
});
