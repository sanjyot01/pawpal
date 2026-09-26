import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import type { Camera } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { fetchORSRoute, formatWalkDuration as formatDuration, formatWalkDistance as formatDistance, LatLng } from '../utils/routing';

const ORS_API_KEY = 'YOUR_OPENROUTESERVICE_API_KEY'; // 替换成你的 Key

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLng = (b.longitude - a.longitude) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

interface RouteMapPickerProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (route: string, startCoord: LatLng, endCoord: LatLng) => void;
}

const DEFAULT_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

async function reverseGeocode(coord: LatLng): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync(coord);
    if (results.length > 0) {
      const r = results[0];
      const label = [r.name, r.street, r.district, r.city]
        .filter(Boolean)
        .slice(0, 2)
        .join(', ');
      if (label) return label;
    }
  } catch {}
  // The platform Geocoder is unavailable on many Android emulators/devices
  // without Play services geocoding — fall back to ORS (Pelias) over HTTP.
  try {
    const url = `https://api.openrouteservice.org/geocode/reverse?api_key=${ORS_API_KEY}&point.lon=${coord.longitude}&point.lat=${coord.latitude}&size=1`;
    const res = await fetch(url);
    const props = (await res.json()).features?.[0]?.properties;
    const label = [props?.name, props?.locality ?? props?.county]
      .filter(Boolean)
      .join(', ');
    if (label) return label;
  } catch {}
  // Last resort in a deliberate fallback chain: a name is nice to have, but raw
  // coordinates still identify the spot, so neither lookup failing is an error.
  return `${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`;
}

export const RouteMapPicker: React.FC<RouteMapPickerProps> = ({ visible, onClose, onConfirm }) => {
  const insets = useSafeAreaInsets();
  const [startPin, setStartPin] = useState<LatLng | null>(null);
  const [endPin, setEndPin] = useState<LatLng | null>(null);
  const [startLabel, setStartLabel] = useState('');
  const [endLabel, setEndLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'start' | 'end'>('start');
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ duration: string; distance: string } | null>(null);
  const [startSheetVisible, setStartSheetVisible] = useState(false);
  const mapRef = useRef<MapView>(null);

  const handleMapPress = async (e: any) => {
    const coord: LatLng = e.nativeEvent.coordinate;
    setLoading(true);
    const label = await reverseGeocode(coord);
    setLoading(false);

    if (step === 'start') {
      setStartPin(coord);
      setStartLabel(label);
      setRouteCoords([]);
      setStep('end');
    } else {
      if (startPin && haversineKm(startPin, coord) > 100) {
        Alert.alert(
          '⚠️ Distance Too Far',
          'The distance between start and destination exceeds 100 km. Please choose a closer destination.',
          [{ text: 'OK' }]
        );
        return;
      }
      setEndPin(coord);
      setEndLabel(label);
      // 两点都有了，请求真实路线
      if (startPin) {
        setLoading(true);
        const result = await fetchORSRoute(startPin, coord);
        if (result) {
          setRouteCoords(result.coords);
          setRouteInfo({
            duration: formatDuration(result.durationSeconds),
            distance: formatDistance(result.distanceMeters),
          });
        }
        setLoading(false);
      }
    }
  };

  const handleConfirm = () => {
    if (!startPin || !endPin || !startLabel || !endLabel) return;
    onConfirm(`${startLabel} → ${endLabel}`, startPin, endPin);
    handleReset();
  };

  const handleReset = () => {
    setStartPin(null);
    setEndPin(null);
    setStartLabel('');
    setEndLabel('');
    setRouteCoords([]);
    setRouteInfo(null);
    setStep('start');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const isReady = startPin && endPin;

  // Auto-set start pin to current location when modal opens
  useEffect(() => {
    if (!visible) return;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coord: LatLng = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      const label = await reverseGeocode(coord);
      setStartPin(coord);
      setStartLabel(label);
      setStep('end');
      mapRef.current?.animateCamera({ center: coord, zoom: 15 }, { duration: 800 });
    })();
  }, [visible]);

  const handleStartPress = () => setStartSheetVisible(true);

  const handleStartMyLocation = async () => {
    setStartSheetVisible(false);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coord: LatLng = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    const label = await reverseGeocode(coord);
    setStartPin(coord);
    setStartLabel(label);
    setRouteCoords([]);
    setRouteInfo(null);
    setEndPin(null);
    setEndLabel('');
    setStep('end');
    mapRef.current?.animateCamera({ center: coord, zoom: 15 }, { duration: 600 });
  };

  const handleStartSelectOnMap = () => {
    setStartSheetVisible(false);
    setStartPin(null);
    setStartLabel('');
    setEndPin(null);
    setEndLabel('');
    setRouteCoords([]);
    setRouteInfo(null);
    setStep('start');
  };

  const handleLocateMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    mapRef.current?.animateCamera(
      { center: { latitude: loc.coords.latitude, longitude: loc.coords.longitude }, zoom: 15 },
      { duration: 600 }
    );
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <Text style={styles.closeArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Select Route</Text>
          <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Hint bar */}
        <View style={[styles.hintBar, step === 'start' ? styles.hintStart : styles.hintEnd]}>
          <Text style={styles.hintText}>
            {!startPin
              ? '📍 Tap on the map to set Start point'
              : !endPin
              ? '🏁 Tap on the map to set End point'
              : '✅ Route selected — confirm below'}
          </Text>
        </View>

        {/* Map + zoom controls in a flex:1 wrapper so zoom is always inside map area */}
        <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
          initialRegion={DEFAULT_REGION}
          onPress={handleMapPress}
          onPoiClick={handleMapPress}
          showsUserLocation
          zoomEnabled
          zoomTapEnabled
          scrollEnabled
          pitchEnabled={false}
          rotateEnabled={false}
          showsMyLocationButton={false}
        >
          {startPin && (
            <Marker coordinate={startPin} title="Start">
              <View style={styles.pinA}>
                <Text style={styles.pinText}>A</Text>
              </View>
            </Marker>
          )}
          {endPin && (
            <Marker coordinate={endPin} title="End">
              <View style={styles.pinB}>
                <Text style={styles.pinText}>B</Text>
              </View>
            </Marker>
          )}
          {routeCoords.length > 1 ? (
            <Polyline
              coordinates={routeCoords}
              strokeColor="#2563EB"
              strokeWidth={6}
            />
          ) : startPin && endPin ? (
            <Polyline
              coordinates={[startPin, endPin]}
              strokeColor="#2563EB"
              strokeWidth={6}
            />
          ) : null}
        </MapView>

        {/* Locate Me Button */}
        <TouchableOpacity style={styles.locateBtn} onPress={handleLocateMe}>
          <Text style={styles.locateBtnIcon}>📍</Text>
        </TouchableOpacity>

        {/* Zoom Controls — inside mapWrapper so bottom:16 is relative to map, not screen */}
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
        </View>{/* end mapWrapper */}

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        )}

        {/* Bottom sheet */}
        <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Start row — tappable */}
          <TouchableOpacity style={styles.locationRow} onPress={handleStartPress} activeOpacity={0.7}>
            <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
            <Text style={[styles.locationText, !startLabel && styles.locationPlaceholder]} numberOfLines={1}>
              {startLabel ? `Start: ${startLabel}` : 'Tap to select start point'}
            </Text>
            <Text style={styles.locationRowArrow}>›</Text>
          </TouchableOpacity>
          {/* End row */}
          <View style={styles.locationRow}>
            <View style={[styles.dot, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.locationText} numberOfLines={1}>
              {endLabel ? `End: ${endLabel}` : 'End: tap map to select'}
            </Text>
          </View>

          {/* Route info */}
          {routeInfo && (
            <View style={styles.routeInfoRow}>
              <Text style={styles.routeInfoText}>🚶 {routeInfo.duration}</Text>
              <View style={styles.routeInfoDivider} />
              <Text style={styles.routeInfoText}>📏 {routeInfo.distance}</Text>
            </View>
          )}

          {/* Confirm */}
          <TouchableOpacity
            style={[styles.confirmBtn, !isReady && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!isReady}
          >
            <Text style={styles.confirmText}>Confirm Route →</Text>
          </TouchableOpacity>
        </View>

        {/* Start location action sheet */}
        {startSheetVisible && (
          <Pressable style={styles.sheetOverlay} onPress={() => setStartSheetVisible(false)}>
            <Pressable style={styles.actionSheet} onPress={() => {}}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Set Start Location</Text>

              <TouchableOpacity style={styles.sheetOption} onPress={handleStartMyLocation}>
                <View style={styles.sheetOptionIcon}>
                  <Text style={styles.sheetOptionEmoji}>📍</Text>
                </View>
                <View style={styles.sheetOptionText}>
                  <Text style={styles.sheetOptionLabel}>My Location</Text>
                  <Text style={styles.sheetOptionSub}>Use your current GPS location</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetOption} onPress={handleStartSelectOnMap}>
                <View style={styles.sheetOptionIcon}>
                  <Text style={styles.sheetOptionEmoji}>🗺️</Text>
                </View>
                <View style={styles.sheetOptionText}>
                  <Text style={styles.sheetOptionLabel}>Select on Map</Text>
                  <Text style={styles.sheetOptionSub}>Tap the map to set start point</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setStartSheetVisible(false)}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeArrow: { fontSize: 20, color: COLORS.text, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  resetBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  resetText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },

  hintBar: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  hintStart: { backgroundColor: '#F0FDF4' },
  hintEnd: { backgroundColor: '#FFF8F5' },
  hintText: { fontSize: 13, fontWeight: '500', color: COLORS.text },

  mapWrapper: { flex: 1 },
  map: { flex: 1 },
  locateBtn: {
    position: 'absolute',
    right: 14,
    bottom: 110,
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
  locateBtnIcon: { fontSize: 22 },
  zoomControls: {
    position: 'absolute',
    right: 14,
    bottom: 16,
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
    color: '#1a1a1a',
    lineHeight: 26,
  },
  zoomDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },

  pinA: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#22C55E',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  pinB: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  pinText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  locationText: { fontSize: 14, color: COLORS.text, flex: 1 },
  locationPlaceholder: { color: COLORS.textMuted },
  locationRowArrow: { fontSize: 18, color: COLORS.textMuted, marginLeft: 4 },

  confirmBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmBtnDisabled: { backgroundColor: COLORS.textMuted, shadowOpacity: 0 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  sheetOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOptionEmoji: { fontSize: 22 },
  sheetOptionText: { flex: 1 },
  sheetOptionLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sheetOptionSub: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  sheetCancel: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderRadius: 14,
  },
  sheetCancelText: { fontSize: 15, fontWeight: '600', color: COLORS.textSub },

  routeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 12,
  },
  routeInfoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  routeInfoDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#BFDBFE',
  },
});
