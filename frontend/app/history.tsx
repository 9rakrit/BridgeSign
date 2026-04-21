import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;

type Item = {
  id: string;
  gesture_text: string;
  gesture_confidence: number;
  emotion: string;
  emotion_confidence: number;
  distress: boolean;
  created_at: string;
};

const EMOTION_COLORS: Record<string, string> = {
  Happy: '#34C759',
  Neutral: '#64D2FF',
  Sad: '#FF9500',
  Angry: '#FF3B30',
  Fear: '#FF453A',
  Surprise: '#AF52DE',
};

export default function HistoryScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/history`);
      const data = await resp.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onClear = () => {
    Alert.alert('Clear history?', 'This will remove all recorded recognitions.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await fetch(`${BACKEND_URL}/api/history`, { method: 'DELETE' });
          load();
        },
      },
    ]);
  };

  return (
    <View style={styles.root} testID="history-screen">
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} testID="history-back">
          <Ionicons name="chevron-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <Text style={styles.title}>History</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={onClear} testID="history-clear">
          <Ionicons name="trash" size={20} color="#F8FAFC" />
        </TouchableOpacity>
      </SafeAreaView>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#F8FAFC" />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="file-tray-outline" size={48} color="#475569" />
              <Text style={styles.emptyTitle}>No recognitions yet</Text>
              <Text style={styles.emptyText}>Captured gestures and emotions will appear here.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const color = EMOTION_COLORS[item.emotion] ?? '#64D2FF';
          return (
            <View style={styles.card} testID="history-list-item">
              <View style={[styles.emoDot, { backgroundColor: color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardGesture}>{item.gesture_text || '—'}</Text>
                <Text style={styles.cardMeta}>
                  <Text style={{ color }}>{item.emotion}</Text>
                  <Text style={styles.muted}>  ·  {new Date(item.created_at).toLocaleString()}</Text>
                </Text>
              </View>
              <Text style={styles.confBig}>{Math.round(item.gesture_confidence * 100)}%</Text>
              {item.distress && (
                <View style={styles.distressBadge}>
                  <Ionicons name="alert-circle" size={12} color="#FFF" />
                </View>
              )}
            </View>
          );
        }}
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
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  emoDot: { width: 12, height: 12, borderRadius: 6 },
  cardGesture: { color: '#F8FAFC', fontSize: 18, fontWeight: '800', letterSpacing: 0.4 },
  cardMeta: { marginTop: 4, fontSize: 12, fontWeight: '600' },
  muted: { color: '#64748B', fontSize: 12 },
  confBig: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  distressBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center',
  },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '700', marginTop: 12 },
  emptyText: { color: '#64748B', fontSize: 13, marginTop: 4, textAlign: 'center' },
});
