import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { COLORS } from '../constants/colors';
import { FilterRow } from '../components/FilterRow';
import { DistanceSlider, DEFAULT_RADIUS_KM, MAX_RADIUS_KM } from '../components/DistanceSlider';
import { PetCard } from '../components/PetCard';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiGet, apiPost, errorMessage } from '../utils/api';

export interface DateInvitation {
  id: string;
  hostUserId: string;
  hostPetId?: string;
  location?: string;
  date?: string;
  time?: string;
  message?: string;
  status: string;
  pendingRequestCount?: number;
  petName?: string;
  petSpecies?: string;
  petBreed?: string;
  petProfilePhotoUrl?: string;
  petAge?: string;
  imageUrls?: string[];
}

export interface DateFeedItem {
  id: string;
  hostUserId: string;
  location?: string;
  date?: string;
  time?: string;
  message?: string;
  ownerName?: string;
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
  imageUrls?: string[];
}

interface PetBlindDateScreenProps {
  navigation: any;
}

const speciesEmoji = (species?: string) => {
  if (species === 'DOG') return '🐕';
  if (species === 'CAT') return '🐱';
  return '🐾';
};

const petTags = (item: DateFeedItem): string[] => {
  const tags: string[] = [];
  if (item.petIsVaccinated) tags.push('Vaccinated');
  if (item.petIsNeutered) tags.push('Neutered');
  return tags;
};

export const PetBlindDateScreen: React.FC<PetBlindDateScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [speciesFilter, setSpeciesFilter] = useState('All');
  const [ageFilter, setAgeFilter] = useState('Any');
  const [vaccineFilter, setVaccineFilter] = useState('All');
  const [breedFilter, setBreedFilter] = useState('All');
  const [myInvitations, setMyInvitations] = useState<DateInvitation[]>([]);
  const [feed, setFeed] = useState<DateFeedItem[]>([]);
  const [heartedIds, setHeartedIds] = useState<Set<string>>(new Set());
  // Bounds the feed server-side; the backend clamps it to app.discovery.max-radius-km.
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);

  const datesAnim = useRef(new Animated.Value(1)).current;
  const isDatesVisible = useRef(true);

  const showDates = useCallback(() => {
    if (isDatesVisible.current) return;
    isDatesVisible.current = true;
    Animated.timing(datesAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  }, [datesAnim]);

  const hideDates = useCallback(() => {
    if (!isDatesVisible.current) return;
    isDatesVisible.current = false;
    Animated.timing(datesAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  }, [datesAnim]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y > 50) hideDates();
    else if (y < 20) showDates();
  }, [hideDates, showDates]);

  // Settle to the correct state at the final scroll position (fast flings can
  // end inside the 20-50px dead zone without a matching scroll event).
  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y < 50) showDates();
  }, [showDates]);

  const datesMaxHeight = datesAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 200] });

  const buildFeedPath = useCallback(async () => {
    const params = new URLSearchParams();
    if (speciesFilter !== 'All') params.append('species', speciesFilter);
    if (ageFilter !== 'Any') params.append('age', ageFilter);
    if (vaccineFilter !== 'All') params.append('vaccine', vaccineFilter);
    if (breedFilter !== 'All') params.append('breed', breedFilter);
    // Location is optional: without it the feed comes back unlocated rather
    // than not at all, so a denied permission is not an error.
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
    return `/api/date/invitations/feed${qs ? '?' + qs : ''}`;
  }, [speciesFilter, ageFilter, vaccineFilter, breedFilter, radiusKm]);

  const loadData = useCallback(async () => {
    try {
      setLoadError(undefined);
      const feedPath = await buildFeedPath();
      const [invs, feedItems, sentReqs] = await Promise.all([
        apiGet<DateInvitation[]>('/api/date/invitations/my'),
        apiGet<DateFeedItem[]>(feedPath),
        apiGet<Array<{ invitationId: string; status: string }>>('/api/date/requests/my-sent'),
      ]);
      setMyInvitations(invs);
      setFeed(feedItems);
      setHeartedIds(new Set(sentReqs.map(r => r.invitationId)));
    } catch (e) {
      // With filters applied, an empty feed reads as "your filters matched
      // nothing" — people then widen the filters and still see nothing.
      setLoadError(errorMessage(e, 'Could not load blind dates.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildFeedPath]);

  // The 5s /api/messages/unread-counts poll that used to run here existed only to light a
  // dot on the header's message button. That button now lives once, on the Home map.
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  const handleHeart = useCallback(async (item: DateFeedItem) => {
    if (heartedIds.has(item.id)) return;
    try {
      await apiPost('/api/date/requests', { invitationId: item.id });
      setHeartedIds(prev => new Set([...prev, item.id]));
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to send request');
    }
  }, [heartedIds]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {/* Notifications live once, on the Home map. The per-invitation request counts
            further down stay — those describe a specific date you posted. */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>💕 Pet Blind Date</Text>
            <Text style={styles.headerSub}>Find the perfect match for your pet</Text>
          </View>
        </View>
      </View>

      {/* My Dates — animated show/hide */}
      <Animated.View style={[styles.myDatesSection, { maxHeight: datesMaxHeight, opacity: datesAnim, overflow: 'hidden' }]}>
        <View style={styles.myDatesHeader}>
          <Text style={styles.myDatesTitle}>My Dates</Text>
          <View style={styles.myDatesHeaderActions}>
            <TouchableOpacity style={styles.completedBtn} onPress={() => navigation.navigate('CompletedDates')}>
              <Text style={styles.completedText}>✓ Completed</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('PostDateInvitation')}>
              <Text style={styles.manageText}>+ Post Date →</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.myDatesScroll}
        >
          {myInvitations.map(d => (
            <TouchableOpacity
              key={d.id}
              style={styles.dateCard}
              onPress={() => navigation.navigate('EditDateInvitation', { invitation: d })}
              activeOpacity={0.8}
            >
              <View style={styles.dateCardTop}>
                <View style={styles.dateAvatar}>
                  <Text style={styles.dateAvatarEmoji}>{speciesEmoji(d.petSpecies)}</Text>
                </View>
                <View style={[styles.statusBadge, d.status === 'ACTIVE' ? styles.statusActive : styles.statusDraft]}>
                  <Text style={[styles.statusText, d.status === 'ACTIVE' ? styles.statusTextActive : styles.statusTextDraft]}>
                    {d.status === 'ACTIVE' ? 'Active' : d.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.datePetName}>{d.petName ?? '—'}</Text>
              {d.location && <Text style={styles.dateMeta} numberOfLines={1}>📍 {d.location}</Text>}
              {d.date && <Text style={styles.dateMeta}>🗓 {d.date}</Text>}
              {(d.pendingRequestCount ?? 0) > 0 && (
                <TouchableOpacity
                  style={styles.requestsBadge}
                  onPress={() => navigation.navigate('Notifications' as any, { filter: 'date' } as any)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.requestsText}>💕 {d.pendingRequestCount} requests</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.addDateCard} onPress={() => navigation.navigate('PostDateInvitation')}>
            <Text style={styles.addDateIcon}>+</Text>
            <Text style={styles.addDateText}>Post a Date</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>

      {/* Filters */}
      <View style={styles.filtersSection}>
        <FilterRow label="Species" options={['All', 'Dog', 'Cat', 'Other']} active={speciesFilter} onSelect={setSpeciesFilter} accentColor={COLORS.purple} />
        <FilterRow label="Age" options={['Any', '0-1y', '1-3y', '3-7y', '7y+']} active={ageFilter} onSelect={setAgeFilter} accentColor={COLORS.purple} />
        <FilterRow label="Vaccine" options={['All', 'Yes', 'No']} active={vaccineFilter} onSelect={setVaccineFilter} accentColor={COLORS.purple} />
        <FilterRow label="Breed" options={['All', 'Persian', 'Corgi', 'Poodle', 'Shiba', 'Maine Coon']} active={breedFilter} onSelect={setBreedFilter} accentColor={COLORS.purple} />
        <DistanceSlider value={radiusKm} max={MAX_RADIUS_KM} onRelease={setRadiusKm} accentColor={COLORS.purple} />
      </View>

      {/* List */}
      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEnd}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.purple} />}
        ListHeaderComponent={
          <View style={styles.countRow}>
            <Text style={styles.countText}>💕 {feed.length} Nearby Matches</Text>
            <TouchableOpacity style={styles.sortBtn}>
              <Text style={styles.sortBtnText}>Sort: Distance ↓</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.purple} style={{ marginTop: 40 }} />
          ) : loadError ? (
            <ErrorNotice message={loadError} onRetry={loadData} />
          ) : (
            <View style={styles.emptyFeed}>
              <Text style={styles.emptyFeedText}>No pet dates nearby yet.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <PetCard
            name={item.petName ?? item.ownerName ?? '—'}
            emoji={speciesEmoji(item.petSpecies)}
            photoUrl={item.petProfilePhotoUrl}
            breed={item.petBreed ?? '—'}
            age={item.petAge ?? ''}
            gender={item.petGender}
            distance={item.distanceLabel ?? ''}
            owner={item.ownerName}
            tags={petTags(item)}
            online
            variant="heart"
            connectStatus={
              item.myRequestStatus === 'REJECTED' || item.myRequestStatus === 'BLOCKED' ? 'rejected'
              : item.myRequestStatus === 'ACCEPTED' ? 'accepted'
              : item.myRequestStatus === 'PENDING' || heartedIds.has(item.id) ? 'requested'
              : 'default'
            }
            onHeart={() => handleHeart(item)}
            onPress={() => navigation.navigate('DatePetProfile', {
              feedItem: item,
              alreadyRequested: heartedIds.has(item.id) || !!item.myRequestStatus,
            })}
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  listContent: {},
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  headerSub: { fontSize: 13, color: COLORS.textSub },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  myDatesSection: { backgroundColor: COLORS.card },
  myDatesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    marginBottom: 10,
  },
  myDatesTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  myDatesHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  completedBtn: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  completedText: { color: COLORS.textSub, fontSize: 12, fontWeight: '700' },
  manageText: { fontSize: 13, color: COLORS.purple, fontWeight: '600' },
  myDatesScroll: { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  dateCard: {
    backgroundColor: COLORS.purpleLight,
    borderRadius: 14,
    padding: 12,
    width: 150,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    gap: 3,
  },
  dateCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  dateAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateAvatarEmoji: { fontSize: 20 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  statusActive: { backgroundColor: '#DCFCE7' },
  statusDraft: { backgroundColor: '#F3F4F6' },
  statusText: { fontSize: 10, fontWeight: '600' },
  statusTextActive: { color: '#16A34A' },
  statusTextDraft: { color: COLORS.textMuted },
  datePetName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  dateMeta: { fontSize: 11, color: COLORS.textSub },
  requestsBadge: {
    marginTop: 4,
    backgroundColor: '#EDE9FE',
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  requestsText: { fontSize: 10, color: COLORS.purple, fontWeight: '600' },
  addDateCard: {
    width: 100,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'transparent',
  },
  addDateIcon: { fontSize: 24, color: COLORS.purple, fontWeight: '300' },
  addDateText: { fontSize: 12, color: COLORS.purple, fontWeight: '600', textAlign: 'center' },
  filtersSection: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  countText: { fontSize: 15, fontWeight: '700', color: COLORS.purple },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: COLORS.purpleLight,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  sortBtnText: { fontSize: 12, color: COLORS.purple, fontWeight: '600' },
  emptyFeed: { alignItems: 'center', paddingVertical: 40 },
  emptyFeedText: { fontSize: 14, color: COLORS.textMuted },
});
