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

interface CompletedWalk {
  id: string;
  route: string;
  date: string;
  time: string;
  durationMinutes?: number;
  role: 'HOST' | 'PARTICIPANT';
  hostName?: string;
  hostAvatarUrl?: string;
  participants: CompletedParticipant[];
}

interface CompletedWalksScreenProps {
  navigation: any;
}

export const CompletedWalksScreen: React.FC<CompletedWalksScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [walks, setWalks] = useState<CompletedWalk[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string>();

  const loadData = useCallback(async () => {
    try {
      setLoadError(undefined);
      const data = await apiGet<CompletedWalk[]>('/api/walk/invitations/completed');
      setWalks(data);
    } catch (e) {
      // "No completed walks yet" is a very believable lie when the request
      // failed, so say which one actually happened.
      setLoadError(errorMessage(e, 'Could not load completed walks.'));
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
        <Text style={styles.headerTitle}>✓ Completed Walks</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={walks}
        keyExtractor={(item, i) => `${item.id}-${item.role}-${i}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : loadError ? (
            <ErrorNotice message={loadError} onRetry={loadData} />
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>🚶</Text>
              <Text style={styles.emptyTitle}>No completed walks yet</Text>
              <Text style={styles.emptyText}>Walks show up here once their scheduled time has passed.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.roleBadge, item.role === 'HOST' ? styles.roleBadgeHost : styles.roleBadgeParticipant]}>
                <Text style={[styles.roleBadgeText, item.role === 'HOST' ? styles.roleBadgeTextHost : styles.roleBadgeTextParticipant]}>
                  {item.role === 'HOST' ? '🚶 You hosted' : '✓ You joined'}
                </Text>
              </View>
            </View>
            <Text style={styles.route} numberOfLines={1}>📍 {item.route}</Text>
            <Text style={styles.meta}>
              🗓 {item.date} · {item.time}
              {item.durationMinutes ? ` · ${item.durationMinutes} min` : ''}
            </Text>

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
                <Text style={styles.participantsLabel}>Went with you</Text>
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
  backText: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
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
  roleBadgeHost: { backgroundColor: COLORS.primaryLight },
  roleBadgeParticipant: { backgroundColor: '#DCFCE7' },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  roleBadgeTextHost: { color: COLORS.primary },
  roleBadgeTextParticipant: { color: '#16A34A' },
  route: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  meta: { fontSize: 12, color: COLORS.textSub },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  personAvatarImg: { width: 28, height: 28, borderRadius: 14 },
  personAvatarFallback: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  personAvatarText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  personName: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  participantsWrap: { marginTop: 4, gap: 2 },
  participantsLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginBottom: 2 },
  noOneText: { fontSize: 12, color: COLORS.textMuted, marginTop: 4, fontStyle: 'italic' },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
});
