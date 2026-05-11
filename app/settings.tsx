import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  autoAnalyze: 'sg_auto_analyze',
  ttsEnabled: 'sg_tts_enabled',
  caregiverAlerts: 'sg_caregiver_alerts',
};

export default function Settings() {
  const router = useRouter();
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [caregiverAlerts, setCaregiverAlerts] = useState(true);

  useEffect(() => {
    (async () => {
      const [a, t, c] = await Promise.all([
        AsyncStorage.getItem(KEYS.autoAnalyze),
        AsyncStorage.getItem(KEYS.ttsEnabled),
        AsyncStorage.getItem(KEYS.caregiverAlerts),
      ]);
      if (a !== null) setAutoAnalyze(a === '1');
      if (t !== null) setTtsEnabled(t === '1');
      if (c !== null) setCaregiverAlerts(c === '1');
    })();
  }, []);

  const save = async (k: string, v: boolean) => AsyncStorage.setItem(k, v ? '1' : '0');

  return (
    <View style={styles.root} testID="settings-screen">
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 44 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Section title="RECOGNITION">
          <Row
            icon="pulse"
            label="Auto-analyze frames"
            desc="Capture & analyse a frame every ~4s"
            value={autoAnalyze}
            onChange={(v) => { setAutoAnalyze(v); save(KEYS.autoAnalyze, v); }}
            testID="settings-auto-analyze-toggle"
          />
        </Section>

        <Section title="ACCESSIBILITY">
          <Row
            icon="volume-high"
            label="Text-to-Speech"
            desc="Speak recognised words aloud"
            value={ttsEnabled}
            onChange={(v) => { setTtsEnabled(v); save(KEYS.ttsEnabled, v); }}
            testID="settings-tts-toggle"
          />
          <Row
            icon="alert-circle"
            label="Caregiver distress alerts"
            desc="Highlight potential distress signals"
            value={caregiverAlerts}
            onChange={(v) => { setCaregiverAlerts(v); save(KEYS.caregiverAlerts, v); }}
            testID="settings-caregiver-toggle"
          />
        </Section>

        <Section title="ABOUT">
          <View style={styles.card}>
            <View style={styles.iconSquare}>
              <Ionicons name="hand-left" size={18} color="#0B1220" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>BridgeSign v1.0</Text>
              <Text style={styles.cardDesc}>
                Emotion-Aware Sign Language Communication System.{'\n'}
                For accessibility use only — not a medical device.
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.link} onPress={() => Linking.openURL('https://www.nad.org/resources/american-sign-language/what-is-american-sign-language/')}>
            <Ionicons name="book-outline" size={18} color="#64D2FF" />
            <Text style={styles.linkText}>Learn about American Sign Language</Text>
            <Ionicons name="chevron-forward" size={18} color="#64748B" />
          </TouchableOpacity>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

function Row({
  icon, label, desc, value, onChange, testID,
}: { icon: any; label: string; desc: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.iconSquare}>
        <Ionicons name={icon} size={18} color="#0B1220" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: '#34C759', false: '#475569' }}
        thumbColor="#F8FAFC"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1220' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: '#F8FAFC', fontSize: 20, fontWeight: '800' },
  sectionTitle: { color: '#64748B', letterSpacing: 1.4, fontSize: 11, fontWeight: '800', marginBottom: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  iconSquare: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { color: '#F8FAFC', fontSize: 15, fontWeight: '700' },
  rowDesc: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  cardTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  cardDesc: { color: '#94A3B8', fontSize: 12, marginTop: 4, lineHeight: 18 },
  link: {
    marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 14,
    backgroundColor: 'rgba(100,210,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(100,210,255,0.18)',
  },
  linkText: { color: '#F8FAFC', fontSize: 14, fontWeight: '700', flex: 1 },
});
