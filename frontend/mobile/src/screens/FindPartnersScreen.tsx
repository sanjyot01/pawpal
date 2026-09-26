import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { COLORS } from '../constants/colors';
import { FilterRow } from '../components/FilterRow';
import { DistanceSlider, DEFAULT_RADIUS_KM, MAX_RADIUS_KM } from '../components/DistanceSlider';
import { PetCard } from '../components/PetCard';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiGet, errorMessage } from '../utils/api';

export interface WalkInvitation {
  id: string;
  route: string;
  date: string;
  time: string;
  durationMinutes: number;
  maxSpots: number;
  spotsLeft?: number;
  message?: string;
  status: string;
  hostPetIds?: string[];
  pendingRequestCount?: number;
}

export interface WalkFeedItem {
  id: string;
  route: string;
  date: string;
  time: string;
  durationMinutes: number;
  maxSpots: number;
  spotsLeft: number;
  message?: string;
  ownerId: string;
  ownerName: string;
  ownerAvatarUrl?: string;
  petId?: string;
  petName?: string;
  petSpecies?: string;
  petBreed?: string;
  petGender?: string;
  petAge?: string;
  petProfilePhotoUrl?: string;
  petIsVaccinated?: boolean;
  petIsNeutered?: boolean;
  distanceKm?: number;
  distanceLabel?: string;
  myRequestId?: string;
  myRequestStatus?: string;
  unreadMessageCount?: number;
  pets?: Array<{
    petId: string;
    petName: string;
    petSpecies?: string;
    petBreed?: string;
    petGender?: string;
    petAge?: string;
    petProfilePhotoUrl?: string;
    petIsVaccinated?: boolean;
    petIsNeutered?: boolean;
  }>;
}

interface FindPartnersScreenProps {
  navigation: any;
}

export const FindPartnersScreen: React.FC<FindPartnersScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [typeFilter, setTypeFilter] = useState('All');
  // Bounds the feed server-side; the backend clamps it to app.discovery.max-radius-km.
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [myInvitations, setMyInvitations] = useState<WalkInvitation[]>([]);
  const [feed, setFeed] = useState<WalkFeedItem[]>([]);
  const [sentRequestIds, setSentRequestIds] = useState<Set<string>>(new Set());
  const [unreadCountMap, setUnreadCountMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const isFocused = useRef(false);

  const invAnim = useRef(new Animated.Value(1)).current;
  const isInvVisible = useRef(true);

  const showInv = useCallback(() => {
    if (isInvVisible.current) return;
    isInvVisible.current = true;
    Animated.timing(invAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  }, [invAnim]);

  const hideInv = useCallback(() => {
    if (!isInvVisible.current) return;
    isInvVisible.current = false;
    Animated.timing(invAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  }, [invAnim]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y > 50) hideInv();
    else if (y < 20) showInv();
  }, [hideInv, showInv]);

  // Settle to the correct state at the final scroll position (fast flings can
  // end inside the 20-50px dead zone without a matching scroll event).
  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y < 50) showInv();
  }, [showInv]);

  const invMaxHeight = invAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 220] });

  const loadData = useCallback(async () => {
    try {
      setLoadError(undefined);
      const params = new URLSearchParams();
      // Location is optional here: without it the feed is fetched unlocated
      // rather than not at all, so a denied permission is not an error.
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          params.append('lat', String(loc.coords.latitude));
          params.append('lng', String(loc.coords.longitude));
          // Radius only means anything alongside coordinates -- the backend has no
          // origin to measure from otherwise, and sending it would be misleading.
          params.append('radiusKm', String(radiusKm));
        }
      } catch (_) {}
      const qs = params.toString();
      const feedPath = `/api/walk/invitations/feed${qs ? '?' + qs : ''}`;

      const [invs, feedItems, sentReqs] = await Promise.all([
        apiGet<WalkInvitation[]>('/api/walk/invitations/my'),
        apiGet<WalkFeedItem[]>(feedPath),
        apiGet<Array<{ invitationId: string; status: string }>>('/api/walk/requests/my-sent'),
      ]);
      setMyInvitations(invs);
      setFeed(feedItems);
      setSentRequestIds(new Set(sentReqs.map(r => r.invitationId)));
    } catch (e) {
      // Without this the list rendered its empty state, so a failed load was
      // indistinguishable from "no walks near you".
      setLoadError(errorMessage(e, 'Could not load walks.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [radiusKm]);

  // Polled every 5s while this tab is focused, so it fetches only what this screen still
  // renders: the per-conversation unread counts on the partner cards. The companion
  // /api/messages/unread-counts call went with the header's message button.
  const refreshUnread = useCallback(async () => {
    try {
      const data = await apiGet<Array<{ invitationId: string; unreadCount: number }>>(
        '/api/walk/requests/my-sent-unread'
      );
      const map: Record<string, number> = {};
      data.forEach(item => { map[item.invitationId] = item.unreadCount; });
      setUnreadCountMap(map);
    } catch (_) {
      // Unread dots only, on a 5s poll. Keeping the previous counts is better
      // than interrupting the list, and the next tick corrects them.
    }
  }, []);

  useFocusEffect(useCallback(() => {
    isFocused.current = true;
    loadData();
    const interval = setInterval(() => {
      if (isFocused.current) refreshUnread();
    }, 5000);
    return () => {
      isFocused.current = false;
      clearInterval(interval);
    };
  }, [loadData, refreshUnread]));

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  const matchesTypeFilter = (species?: string) => {
    if (typeFilter === 'Dogs') return species === 'DOG';
    if (typeFilter === 'Cats') return species === 'CAT';
    if (typeFilter === 'Other') return !!species && species !== 'DOG' && species !== 'CAT';
    return true; // All
  };

  const filtered = feed.filter(item => {
    if (typeFilter === 'All') return true;
    if (item.pets && item.pets.length > 0) {
      return item.pets.some(p => matchesTypeFilter(p.petSpecies));
    }
    return matchesTypeFilter(item.petSpecies);
  });

  const petTags = (item: WalkFeedItem): string[] => {
    const tags: string[] = [];
    if (item.petIsVaccinated) tags.push('Vaccinated');
    if (item.petIsNeutered) tags.push('Neutered');
    return tags;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {/* No notification button here on purpose — the bell on the Home map is the single
            entry point to the notifications list. The per-invitation request counts below
            stay, because those are facts about a specific invitation you posted, not a
            second copy of the inbox. */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>🚶 Find Walk Partners</Text>
        </View>
      </View>

      {/* My Invitations */}
      <Animated.View style={[styles.invSection, { maxHeight: invMaxHeight, opacity: invAnim, overflow: 'hidden' }]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Invitations</Text>
          <View style={styles.sectionHeaderActions}>
            <TouchableOpacity style={styles.completedBtn} onPress={() => navigation.navigate('CompletedWalks')}>
              <Text style={styles.completedText}>✓ Completed</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.postNewBtn} onPress={() => navigation.navigate('PostInvitation')}>
              <Text style={styles.postNewText}>+ Post New</Text>
            </TouchableOpacity>
          </View>
        </View>

        {myInvitations.length === 0 ? (
          <View style={styles.emptyInv}>
            <Text style={styles.emptyInvText}>No invitations yet. Post one!</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.invitationsScroll}
          >
            {myInvitations.map(inv => (
              <View key={inv.id} style={styles.invCard}>
                <View style={[styles.invBadge,
                  inv.status === 'ACTIVE' ? styles.invBadgeActive : styles.invBadgeDraft]}>
                  <Text style={[styles.invBadgeText,
                    inv.status === 'ACTIVE' ? styles.invBadgeTextActive : styles.invBadgeTextDraft]}>
                    {inv.status === 'ACTIVE' ? 'Active' : inv.status}
                  </Text>
                </View>
                {(inv.pendingRequestCount ?? 0) > 0 && (
                  <TouchableOpacity
                    style={styles.pendingBadge}
                    onPress={() => navigation.navigate('Notifications' as any, { filter: 'walk' } as any)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.pendingBadgeIcon}>🔔</Text>
                    <View style={styles.pendingBadgeCount}>
                      <Text style={styles.pendingBadgeCountText}>{inv.pendingRequestCount}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                <Text style={styles.invRoute} numberOfLines={1}>📍 {inv.route || '—'}</Text>
                <Text style={styles.invMeta}>🗓 {inv.date} · {inv.time}</Text>
                <View style={styles.invFooter}>
                  <Text style={styles.invSpotsText}>👥 {inv.maxSpots} spots</Text>
                  <TouchableOpacity
                    style={styles.invEditBtn}
                    onPress={() => navigation.navigate('EditInvitation', { invitation: inv })}
                  >
                    <Text style={styles.invEditText}>✏️ Edit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </Animated.View>

      {/* Filters */}
      <View style={styles.filtersSection}>
        <FilterRow
          label="Type"
          options={['All', 'Dogs', 'Cats', 'Other']}
          active={typeFilter}
          onSelect={setTypeFilter}
        />
        <DistanceSlider
          value={radiusKm}
          max={MAX_RADIUS_KM}
          onRelease={setRadiusKm}
        />
      </View>

      {/* Feed */}
      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEnd}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        <Text style={styles.sectionTitle}>Nearby Walking Partners</Text>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : loadError ? (
          <ErrorNotice message={loadError} onRetry={loadData} />
        ) : filtered.length === 0 ? (
          <View style={styles.emptyFeed}>
            <Text style={styles.emptyFeedText}>No walk partners nearby yet.</Text>
          </View>
        ) : (
          filtered.map(item => (
            <PetCard
              key={item.id}
              name={item.petName || item.ownerName}
              emoji={item.petSpecies === 'CAT' ? '🐈' : '🐕'}
              photoUrl={item.ownerAvatarUrl}
              breed={item.petBreed || '—'}
              age={item.petAge || ''}
              distance={item.distanceLabel || ''}
              time={`${item.date} · ${item.time}`}
              owner={item.ownerName}
              online
              tags={petTags(item)}
              rating={0}
              variant="connect"
              connectStatus={
                item.myRequestStatus === 'REJECTED' || item.myRequestStatus === 'BLOCKED' ? 'rejected'
                : item.myRequestStatus === 'ACCEPTED' ? 'accepted'
                : item.myRequestStatus === 'PENDING' || sentRequestIds.has(item.id) ? 'requested'
                : 'default'
              }
              messageCount={unreadCountMap[item.id] ?? item.unreadMessageCount}
              onConnect={() => navigation.navigate('ConnectPetProfile', { feedItem: item })}
              onMessage={() => navigation.navigate('Notifications' as any, { filter: 'walk' } as any)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invSection: { backgroundColor: COLORS.card },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    paddingHorizontal: 20,
    paddingTop: 14,
    marginBottom: 10,
  },
  sectionHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  completedBtn: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  completedText: { color: COLORS.textSub, fontSize: 12, fontWeight: '700' },
  postNewBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  postNewText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  invitationsScroll: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, gap: 10 },
  emptyInv: { paddingHorizontal: 20, paddingBottom: 14 },
  emptyInvText: { fontSize: 13, color: COLORS.textMuted },
  invCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingTop: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 200,
    maxWidth: 260,
    gap: 4,
    overflow: 'visible',
  },
  invBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 100,
    marginBottom: 2,
  },
  invBadgeActive: { backgroundColor: '#DCFCE7' },
  invBadgeDraft: { backgroundColor: '#F3F4F6' },
  invBadgeText: { fontSize: 11, fontWeight: '600' },
  invBadgeTextActive: { color: '#16A34A' },
  invBadgeTextDraft: { color: COLORS.textMuted },
  invRoute: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  invMeta: { fontSize: 12, color: COLORS.textSub },
  pendingBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  pendingBadgeIcon: {
    fontSize: 20,
  },
  pendingBadgeCount: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  pendingBadgeCountText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 12,
  },
  invFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  invSpotsText: { fontSize: 12, color: COLORS.textSub },
  invEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  invEditText: { fontSize: 11, color: COLORS.textSub, fontWeight: '500' },
  filtersSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  listScroll: { flex: 1 },
  listContent: { paddingTop: 4 },
  emptyFeed: { alignItems: 'center', paddingVertical: 40 },
  emptyFeedText: { fontSize: 14, color: COLORS.textMuted },
});
