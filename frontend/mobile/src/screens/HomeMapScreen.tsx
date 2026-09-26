import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
// MapView is a default export, not a named one — importing it as a named type failed to
// resolve, which left the ref untyped and every camera callback an implicit any.
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import type { Camera } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants/colors';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiGet, apiPost, errorMessage } from '../utils/api';
import type { WalkFeedItem } from './FindPartnersScreen';

const DEFAULT_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

type MapFeedItem = WalkFeedItem & { latitude?: number; longitude?: number };

/**
 * Marker showing the poster's avatar. Keeps tracksViewChanges enabled until the
 * remote image has loaded, so the marker stays rendered through zoom/pan
 * re-rasterization instead of showing a blank circle.
 */
const PosterMarker: React.FC<{
  item: MapFeedItem;
  onCalloutPress: () => void;
  onMarkerPress: () => void;
}> = ({ item, onCalloutPress, onMarkerPress }) => {
  const [tracking, setTracking] = useState(true);

  return (
    <Marker
      coordinate={{ latitude: item.latitude!, longitude: item.longitude! }}
      title={item.ownerName || item.petName}
      description={`${item.route || ''} · ${item.date || ''} ${item.time || ''}`}
      tracksViewChanges={tracking}
      onPress={onMarkerPress}
      onCalloutPress={onCalloutPress}
    >
      <View style={styles.markerWrap}>
        <View style={styles.markerContainer}>
          {item.ownerAvatarUrl ? (
            <Image
              source={{ uri: item.ownerAvatarUrl }}
              style={styles.markerPhoto}
              onLoad={() => setTimeout(() => setTracking(false), 100)}
            />
          ) : (
            <Text style={styles.markerInitial}>
              {item.ownerName?.[0]?.toUpperCase() ?? (item.petSpecies === 'CAT' ? '🐈' : '🐕')}
            </Text>
          )}
        </View>
        {/* Small pet badge on the avatar */}
        <View style={styles.markerPetBadge}>
          <Text style={styles.markerPetBadgeText}>{item.petSpecies === 'CAT' ? '🐈' : '🐕'}</Text>
        </View>
      </View>
    </Marker>
  );
};

// Two snap points. The sheet used to be a fixed-height View with a handle bar drawn on
// top of it -- the handle looked draggable and never was, so the partner list below the
// fold had no way to come up.
const SCREEN_H = Dimensions.get('window').height;
const SHEET_MIN = 210;
const SHEET_MAX = Math.round(SCREEN_H * 0.62);

export const HomeMapScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [feed, setFeed] = useState<MapFeedItem[]>([]);
  const [loadError, setLoadError] = useState<string>();
  // Drives the layout swap (horizontal strip vs vertical list); the height itself is
  // animated separately so the drag can track the finger between snap points.
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const sheetH = useRef(new Animated.Value(SHEET_MIN)).current;
  // Animated.Value has no synchronous getter, and the pan handlers need the live height
  // to offset from, so mirror it into a ref.
  const sheetHRef = useRef(SHEET_MIN);
  const dragStartH = useRef(SHEET_MIN);

  useEffect(() => {
    const id = sheetH.addListener(({ value }) => { sheetHRef.current = value; });
    return () => sheetH.removeListener(id);
  }, [sheetH]);

  const snapSheet = useCallback((expand: boolean) => {
    setSheetExpanded(expand);
    Animated.spring(sheetH, {
      toValue: expand ? SHEET_MAX : SHEET_MIN,
      // height is a layout prop, so this one cannot run on the native driver.
      useNativeDriver: false,
      bounciness: 2,
      speed: 14,
    }).start();
  }, [sheetH]);

  const sheetPan = useRef(
    PanResponder.create({
      // Claim the touch immediately so a tap on the handle is ours to toggle with.
      onStartShouldSetPanResponder: () => true,
      // Only claim clearly vertical drags, so the horizontal card strip keeps its scroll.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => { dragStartH.current = sheetHRef.current; },
      onPanResponderMove: (_e, g) => {
        // Dragging up is negative dy, and up means taller.
        const next = Math.max(SHEET_MIN, Math.min(SHEET_MAX, dragStartH.current - g.dy));
        sheetH.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        // Barely moved: treat it as a tap on the handle and toggle.
        if (Math.abs(g.dy) < 6) {
          snapSheetRef.current(sheetHRef.current < (SHEET_MIN + SHEET_MAX) / 2);
          return;
        }
        // A flick beats position: releasing mid-travel while still moving should finish
        // the gesture rather than snap back to whichever half the finger happened to be in.
        if (g.vy < -0.5) snapSheetRef.current(true);
        else if (g.vy > 0.5) snapSheetRef.current(false);
        else snapSheetRef.current(sheetHRef.current > (SHEET_MIN + SHEET_MAX) / 2);
      },
      onPanResponderTerminate: () => {
        snapSheetRef.current(sheetHRef.current > (SHEET_MIN + SHEET_MAX) / 2);
      },
    })
  ).current;

  // The responder is built once, so it must not close over the first snapSheet.
  const snapSheetRef = useRef(snapSheet);
  snapSheetRef.current = snapSheet;
  const [selectedItem, setSelectedItem] = useState<MapFeedItem | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState(false);
  // The app's single notification badge. It used to be spread across the Walk, Date and Me
  // headers plus a dot on the Walk tab, each counting something slightly different from its
  // own state, so they regularly disagreed. One bell, one count, read from the server.
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const mapRef = useRef<MapView>(null);

  const handleLocateMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    mapRef.current?.animateCamera(
      { center: { latitude: loc.coords.latitude, longitude: loc.coords.longitude }, zoom: 15 },
      { duration: 600 }
    );
  };

  const loadFeed = useCallback(async () => {
    try {
      setLoadError(undefined);
      let feedPath = '/api/walk/invitations/feed';
      // Location is optional: without it the feed is fetched unlocated rather
      // than not at all, so a denied permission is not an error.
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          feedPath += `?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`;
        }
      } catch (_) {}
      const [items, sentReqs] = await Promise.all([
        apiGet<MapFeedItem[]>(feedPath),
        // Which requests you've already sent only greys out buttons; the feed is
        // still worth showing without it.
        apiGet<Array<{ invitationId: string }>>('/api/walk/requests/my-sent').catch(() => []),
      ]);
      setFeed(items);
      setSentIds(new Set(sentReqs.map(r => r.invitationId)));
    } catch (e) {
      // This is the first screen after login: silently empty here reads as
      // "nobody is around", which is the wrong story when the backend is down.
      setLoadError(errorMessage(e, 'Could not load nearby walks.'));
    }
  }, []);

  // Just a badge count — a failure leaves the previous number rather than
  // interrupting the map, so it stays silent on purpose.
  const loadUnreadNotifs = useCallback(async () => {
    try {
      const { count } = await apiGet<{ count: number }>('/api/notifications/unread-count');
      setUnreadNotifs(count ?? 0);
    } catch (_) {}
  }, []);

  // Refreshed every time Home regains focus, which includes coming back from the
  // notifications list — so reading them clears the badge without a manual refresh.
  useFocusEffect(useCallback(() => {
    loadFeed();
    loadUnreadNotifs();
  }, [loadFeed, loadUnreadNotifs]));

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      mapRef.current?.animateCamera({ center: coords, zoom: 15 }, { duration: 800 });
      // The first loadFeed() fires on focus, which races this permission prompt and usually
      // wins — so on a fresh install the feed was fetched with no coordinates and the sheet
      // read "0 pets nearby" until you switched tabs and came back. Now that a position
      // exists, ask again.
      await loadFeed();
    })();
  }, [loadFeed]);

  const markers = feed.filter(item => item.latitude != null && item.longitude != null);

  const focusItem = (item: MapFeedItem) => {
    if (item.latitude == null || item.longitude == null) return;
    mapRef.current?.animateCamera(
      { center: { latitude: item.latitude, longitude: item.longitude }, zoom: 15 },
      { duration: 500 }
    );
  };

  const selectItem = (item: MapFeedItem) => {
    setSelectedItem(item);
    focusItem(item);
  };

  const handleConnect = async () => {
    if (!selectedItem || sentIds.has(selectedItem.id)) return;
    try {
      setConnecting(true);
      await apiPost('/api/walk/requests', { invitationId: selectedItem.id });
      setSentIds(prev => new Set([...prev, selectedItem.id]));
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send request');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        showsUserLocation
        showsMyLocationButton={false}
        zoomEnabled
        zoomTapEnabled
        scrollEnabled
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {markers.map((item) => (
          <PosterMarker
            key={item.id}
            item={item}
            onMarkerPress={() => selectItem(item)}
            onCalloutPress={() => selectItem(item)}
          />
        ))}
      </MapView>

      {/* Floating Header */}
      <View style={[styles.header, { top: insets.top + 12 }]}>
        <View style={styles.logoChip}>
          <Text style={styles.logoPaw}>🐾</Text>
          <Text style={styles.logoText}>PawPal</Text>
        </View>

        {/* The one place notifications live. Every other screen used to carry its own
            entry point to this same list. */}
        <TouchableOpacity
          style={styles.notifBtn}
          onPress={() => navigation?.navigate('Notifications')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={
            unreadNotifs > 0 ? `Notifications, ${unreadNotifs} unread` : 'Notifications'
          }
        >
          <Text style={styles.notifBtnIcon}>🔔</Text>
          {unreadNotifs > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>
                {unreadNotifs > 99 ? '99+' : unreadNotifs}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Locate Me Button */}
      <TouchableOpacity style={styles.locateBtn} onPress={handleLocateMe}>
        <Text style={styles.locateBtnIcon}>📍</Text>
      </TouchableOpacity>

      {/* Zoom Controls */}
      <View style={styles.zoomControls}>
        <TouchableOpacity
          style={styles.zoomBtn}
          onPress={() => mapRef.current?.getCamera().then((cam: Camera) => {
            mapRef.current?.animateCamera({ zoom: (cam.zoom ?? 14) + 1 }, { duration: 200 });
          })}
        >
          <Text style={styles.zoomBtnText}>+</Text>
        </TouchableOpacity>
        <View style={styles.zoomDivider} />
        <TouchableOpacity
          style={styles.zoomBtn}
          onPress={() => mapRef.current?.getCamera().then((cam: Camera) => {
            mapRef.current?.animateCamera({ zoom: (cam.zoom ?? 14) - 1 }, { duration: 200 });
          })}
        >
          <Text style={styles.zoomBtnText}>−</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet — drag the handle to reveal the full partner list */}
      <Animated.View style={[styles.bottomSheet, { height: sheetH, paddingBottom: insets.bottom + 16 }]}>
        {/* Plain View, not a Touchable: a Touchable runs its own responder and wins the
            gesture, so the drag never reached PanResponder and only the tap worked. The
            tap is handled inside the responder instead. Padded so the grab target is a
            comfortable size even though the bar itself is 4px. */}
        <View style={styles.grabArea} {...sheetPan.panHandlers}>
          <View style={styles.sheetHandle} />
        </View>

        {selectedItem ? (
          <View style={styles.connectPanel}>
            <TouchableOpacity style={styles.connectClose} onPress={() => setSelectedItem(null)}>
              <Text style={styles.connectCloseText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.connectTop}>
              <View style={styles.petMiniAvatar}>
                {selectedItem.petProfilePhotoUrl ? (
                  <Image source={{ uri: selectedItem.petProfilePhotoUrl }} style={styles.petMiniPhoto} />
                ) : (
                  <Text style={styles.petMiniEmoji}>{selectedItem.petSpecies === 'CAT' ? '🐈' : '🐕'}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.connectName} numberOfLines={1}>
                  {selectedItem.petName || selectedItem.ownerName}
                </Text>
                <Text style={styles.connectMeta} numberOfLines={1}>
                  {selectedItem.route || ''}{selectedItem.route ? ' · ' : ''}{selectedItem.date} {selectedItem.time}
                </Text>
                {selectedItem.distanceLabel ? (
                  <Text style={styles.connectMeta}>📍 {selectedItem.distanceLabel} away</Text>
                ) : null}
              </View>
            </View>
            <TouchableOpacity
              style={[styles.connectBtn, sentIds.has(selectedItem.id) && styles.connectBtnSent]}
              onPress={handleConnect}
              disabled={connecting || sentIds.has(selectedItem.id)}
            >
              {connecting
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.connectBtnText}>
                    {sentIds.has(selectedItem.id) ? '✓ Requested' : 'Connect →'}
                  </Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sectionTitle}>Nearby Walking Partners</Text>
                <Text style={styles.nearbyCount}>🐾 {feed.length} pets nearby</Text>
              </View>
              <TouchableOpacity
                style={styles.seeAllBtn}
                onPress={() => navigation?.navigate('Walk')}
              >
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>
            {loadError ? (
              <View style={styles.emptyRow}>
                <ErrorNotice message={loadError} onRetry={loadFeed} compact />
              </View>
            ) : feed.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No walk partners nearby yet.</Text>
              </View>
            ) : sheetExpanded ? (
              // Expanded, the strip becomes a real list: the whole point of dragging up
              // is to read more than three cards without leaving the map.
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.petListContent}
              >
                {feed.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.petRow}
                    activeOpacity={0.85}
                    onPress={() => selectItem(item)}
                  >
                    <View style={styles.petRowAvatar}>
                      {item.petProfilePhotoUrl ? (
                        <Image source={{ uri: item.petProfilePhotoUrl }} style={styles.petRowPhoto} />
                      ) : (
                        <Text style={styles.petMiniEmoji}>{item.petSpecies === 'CAT' ? '🐈' : '🐕'}</Text>
                      )}
                    </View>
                    <View style={styles.petRowInfo}>
                      <Text style={styles.petRowName} numberOfLines={1}>
                        {item.petName || item.ownerName}
                      </Text>
                      <Text style={styles.petRowMeta} numberOfLines={1}>
                        {[item.petBreed, item.route].filter(Boolean).join(' · ') || item.ownerName}
                      </Text>
                      <Text style={styles.petRowMeta} numberOfLines={1}>
                        {[item.date, item.time].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {item.distanceLabel ? (
                      <Text style={styles.petRowDistance}>📍 {item.distanceLabel}</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.petCardsScroll}
              >
                {feed.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.petMiniCard}
                    activeOpacity={0.85}
                    onPress={() => selectItem(item)}
                  >
                    <View style={styles.petMiniAvatar}>
                      {item.petProfilePhotoUrl ? (
                        <Image source={{ uri: item.petProfilePhotoUrl }} style={styles.petMiniPhoto} />
                      ) : (
                        <Text style={styles.petMiniEmoji}>{item.petSpecies === 'CAT' ? '🐈' : '🐕'}</Text>
                      )}
                    </View>
                    <Text style={styles.petMiniName} numberOfLines={1}>{item.petName || item.ownerName}</Text>
                    <Text style={styles.petMiniBreed} numberOfLines={1}>{item.petBreed || item.route || ''}</Text>
                    <Text style={styles.petMiniOwner} numberOfLines={1}>
                      {item.distanceLabel ? `📍 ${item.distanceLabel}` : item.ownerName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  markerWrap: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 2,
    borderColor: COLORS.primaryBorder,
    overflow: 'hidden',
  },
  markerPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  markerEmoji: {
    fontSize: 22,
  },
  markerInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  markerPetBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
  },
  markerPetBadgeText: {
    fontSize: 10,
  },
  locateBtn: {
    position: 'absolute',
    right: 16,
    bottom: 470,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  locateBtnIcon: {
    fontSize: 22,
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    bottom: 360,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  zoomBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: {
    fontSize: 22,
    fontWeight: '300',
    color: COLORS.text,
    lineHeight: 26,
  },
  zoomDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
  },
  header: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  logoPaw: {
    fontSize: 18,
  },
  logoText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  notifBtnIcon: {
    fontSize: 20,
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
  },
  grabArea: {
    paddingTop: 4,
    paddingBottom: 10,
    alignItems: 'center',
  },
  petListContent: { paddingHorizontal: 20, paddingBottom: 12 },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  petRowAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', marginRight: 12,
  },
  petRowPhoto: { width: 48, height: 48 },
  petRowInfo: { flex: 1 },
  petRowName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  petRowMeta: { fontSize: 12, color: COLORS.textSub, marginTop: 1 },
  petRowDistance: { fontSize: 12, color: COLORS.textMuted, marginLeft: 8 },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  connectPanel: {
    paddingHorizontal: 20,
  },
  connectClose: {
    position: 'absolute',
    top: -4,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  connectCloseText: { fontSize: 13, color: COLORS.textSub, fontWeight: '700' },
  connectTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingRight: 36,
  },
  connectName: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  connectMeta: { fontSize: 13, color: COLORS.textSub, marginTop: 1 },
  connectBtn: {
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  connectBtnSent: { backgroundColor: '#22C55E', shadowColor: '#22C55E' },
  connectBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  nearbyCount: {
    fontSize: 13,
    color: COLORS.textSub,
  },
  seeAllBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: COLORS.primaryLight,
  },
  seeAllText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  emptyRow: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  petCardsScroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  petMiniCard: {
    width: 110,
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  petMiniAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    overflow: 'hidden',
  },
  petMiniPhoto: {
    width: 48,
    height: 48,
  },
  petMiniEmoji: {
    fontSize: 24,
  },
  petMiniName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  petMiniBreed: {
    fontSize: 11,
    color: COLORS.textSub,
    textAlign: 'center',
    marginBottom: 2,
  },
  petMiniOwner: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
});
