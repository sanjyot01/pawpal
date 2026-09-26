import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants/colors';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiGet, errorMessage } from '../utils/api';

interface CompletedParticipant {
  userId: string;
  name: string;
  avatarUrl?: string;
  petName?: string;
  petPhotoUrl?: string;
}

interface CompletedDate {
  id: string;
  location: string;
  date: string;
  time: string;
  role: 'HOST' | 'PARTICIPANT';
  hostName?: string;
  hostAvatarUrl?: string;
  participants: CompletedParticipant[];
}

interface CompletedDatesScreenProps {
  navigation: any;
}

export const CompletedDatesScreen: React.FC<CompletedDatesScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [dates, setDates] = useState<CompletedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string>();

  const loadData = useCallback(async () => {
    try {
      setLoadError(undefined);
      const data = await apiGet<CompletedDate[]>('/api/date/invitations/completed');
      setDates(data);
    } catch (e) {
      // "No completed dates yet" is a very believable lie when the request
      // failed, so say which one actually happened.
      setLoadError(errorMessage(e, 'Could not load completed dates.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>✓ Completed Dates</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={dates}
        keyExtractor={(item, i) => `${item.id}-${item.role}-${i}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.purple} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.purple} style={{ marginTop: 40 }} />
          ) : loadError ? (
            <ErrorNotice message={loadError} onRetry={loadData} />
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>💕</Text>
              <Text style={styles.emptyTitle}>No completed dates yet</Text>
              <Text style={styles.emptyText}>Dates show up here once their scheduled time has passed.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.roleBadge, item.role === 'HOST' ? styles.roleBadgeHost : styles.roleBadgeParticipant]}>
                <Text style={[styles.roleBadgeText, item.role === 'HOST' ? styles.roleBadgeTextHost : styles.roleBadgeTextParticipant]}>
                  {item.role === 'HOST' ? '💕 You hosted' : '✓ You joined'}
                </Text>
              </View>
            </View>
            <Text style={styles.location} numberOfLines={1}>📍 {item.location}</Text>
            <Text style={styles.meta}>🗓 {item.date} · {item.time}</Text>

            {item.role === 'PARTICIPANT' ? (
              <View style={styles.personRow}>
                {item.hostAvatarUrl ? (
                  <Image source={{ uri: item.hostAvatarUrl }} style={styles.personAvatarImg} />
                ) : (
                  <View style={styles.personAvatarFallback}>
                    <Text style={styles.personAvatarText}>{item.hostName?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                )}
                <Text style={styles.personName}>Hosted by {item.hostName || 'Unknown'}</Text>
              </View>
            ) : item.participants.length > 0 ? (
              <View style={styles.participantsWrap}>
                <Text style={styles.participantsLabel}>Went on a date with you</Text>
                {item.participants.map(p => (
                  <View key={p.userId} style={styles.personRow}>
                    {p.avatarUrl ? (
                      <Image source={{ uri: p.avatarUrl }} style={styles.personAvatarImg} />
                    ) : (
                      <View style={styles.personAvatarFallback}>
                        <Text style={styles.personAvatarText}>{p.name?.[0]?.toUpperCase() ?? '?'}</Text>
                      </View>
                    )}
                    <Text style={styles.personName}>
                      {p.name}{p.petName ? ` · ${p.petName}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.noOneText}>No one joined this one.</Text>
            )}
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 60 },
  backText: { fontSize: 15, color: COLORS.purple, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  listContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row' },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  roleBadgeHost: { backgroundColor: COLORS.purpleLight },
  roleBadgeParticipant: { backgroundColor: '#DCFCE7' },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  roleBadgeTextHost: { color: COLORS.purple },
  roleBadgeTextParticipant: { color: '#16A34A' },
  location: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  meta: { fontSize: 12, color: COLORS.textSub },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  personAvatarImg: { width: 28, height: 28, borderRadius: 14 },
  personAvatarFallback: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.purpleLight,
    alignItems: 'center', justifyContent: 'center',
  },
  personAvatarText: { fontSize: 12, fontWeight: '700', color: COLORS.purple },
  personName: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  participantsWrap: { marginTop: 4, gap: 2 },
  participantsLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginBottom: 2 },
  noOneText: { fontSize: 12, color: COLORS.textMuted, marginTop: 4, fontStyle: 'italic' },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
});
