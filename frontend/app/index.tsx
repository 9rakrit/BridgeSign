import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const HERO = 'https://images.pexels.com/photos/9017056/pexels-photo-9017056.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=900';

export default function Onboarding() {
  const router = useRouter();

  return (
    <View style={styles.root} testID="onboarding-screen">
      <ImageBackground source={{ uri: HERO }} style={styles.hero} imageStyle={{ resizeMode: 'cover' }}>
        <LinearGradient
          colors={['rgba(11,18,32,0.2)', 'rgba(11,18,32,0.95)', '#0B1220']}
          locations={[0, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.top} edges={['top']}>
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              <Ionicons name="hand-left" size={22} color="#F8FAFC" />
            </View>
            <Text style={styles.brand}>SignSense</Text>
          </View>
        </SafeAreaView>
      </ImageBackground>

      <ScrollView style={styles.bottom} contentContainerStyle={styles.bottomContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>ASSISTIVE COMMUNICATION</Text>
        <Text style={styles.title}>
          Speak through{'\n'}gesture <Text style={{ color: '#34C759' }}>&</Text> emotion.
        </Text>
        <Text style={styles.subtitle}>
          SignSense uses your camera to recognise American Sign Language and detect facial emotion in real time — giving a voice to every expression.
        </Text>

        <View style={styles.features}>
          <Feature icon="hand-right" color="#34C759" title="ASL recognition" desc="Letters A–Z and words like HELP, HELLO, THANK YOU." />
          <Feature icon="happy" color="#FF9500" title="Emotion awareness" desc="Happy, Sad, Angry, Fear, Surprise, Neutral." />
          <Feature icon="volume-high" color="#AF52DE" title="Text-to-Speech" desc="Tap to speak the sentence out loud." />
          <Feature icon="alert-circle" color="#FF3B30" title="Caregiver alerts" desc="Distress signals are highlighted instantly." />
        </View>

        <TouchableOpacity
          testID="get-started-btn"
          style={styles.cta}
          activeOpacity={0.85}
          onPress={() => router.push('/camera')}
        >
          <Text style={styles.ctaText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={22} color="#0B1220" />
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          This tool assists communication only. It does not provide medical diagnosis.
        </Text>
      </ScrollView>
    </View>
  );
}

function Feature({ icon, color, title, desc }: { icon: any; color: string; title: string; desc: string }) {
  return (
    <View style={styles.feature}>
      <View style={[styles.featureIcon, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1220' },
  hero: { height: 360, width: '100%', justifyContent: 'flex-start' },
  top: { paddingHorizontal: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  brandBadge: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  brand: { color: '#F8FAFC', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
  bottom: { flex: 1, marginTop: -60 },
  bottomContent: { paddingHorizontal: 24, paddingBottom: 40 },
  kicker: { color: '#94A3B8', letterSpacing: 2, fontSize: 11, fontWeight: '600', marginBottom: 10 },
  title: { color: '#F8FAFC', fontSize: 34, fontWeight: '800', lineHeight: 40, letterSpacing: -0.5 },
  subtitle: { color: '#CBD5E1', fontSize: 15, lineHeight: 22, marginTop: 14 },
  features: { marginTop: 28, gap: 14 },
  feature: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    padding: 14, borderRadius: 16,
  },
  featureIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  featureTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '700' },
  featureDesc: { color: '#94A3B8', fontSize: 13, marginTop: 2 },
  cta: {
    marginTop: 30, height: 60, borderRadius: 30,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  ctaText: { color: '#0B1220', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  disclaimer: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 18 },
});
