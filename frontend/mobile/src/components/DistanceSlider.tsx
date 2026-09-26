import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';
import { COLORS } from '../constants/colors';

/**
 * Mirrors the backend's app.discovery defaults. The server clamps whatever it is
 * sent, so these only decide what the control offers — but keep them in step, or
 * the thumb will sit somewhere the feed was never fetched for.
 */
export const DEFAULT_RADIUS_KM = 25;
export const MAX_RADIUS_KM = 100;

/**
 * "Show me matches within N km" — the dating-app distance control.
 *
 * Written against PanResponder rather than a slider package on purpose: this app
 * ships as an Expo dev-client build, so pulling in a native module means
 * rebuilding and reinstalling the APK. PanResponder is core React Native, so this
 * arrives over Metro like any other JS change.
 *
 * The value is only committed on release (`onRelease`), not on every drag frame —
 * each change refetches the feed, and firing that per pixel would hammer the
 * endpoint and make the thumb fight the re-render.
 */
export const DistanceSlider: React.FC<{
  value: number;
  min?: number;
  /** Keep in step with the backend's app.discovery.max-radius-km — it clamps server-side. */
  max?: number;
  onRelease: (km: number) => void;
  accentColor?: string;
}> = ({ value, min = 1, max = 100, onRelease, accentColor = COLORS.primary }) => {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Shown while dragging; `value` is the committed one the feed was fetched with.
  const [preview, setPreview] = useState(value);

  // PanResponder closes over whatever these were when it was built, so the live
  // values live in refs and the responder itself is created once.
  const widthRef = useRef(0);
  const previewRef = useRef(value);
  widthRef.current = width;

  const kmFor = useCallback((x: number) => {
    const w = widthRef.current;
    if (w <= 0) return min;
    const ratio = Math.max(0, Math.min(1, x / w));
    return Math.round(min + ratio * (max - min));
  }, [min, max]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Claim the gesture so the parent ScrollView doesn't steal a horizontal drag.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        setDragging(true);
        const km = kmFor(e.nativeEvent.locationX);
        previewRef.current = km;
        setPreview(km);
      },
      onPanResponderMove: (e, gesture) => {
        // locationX is relative to the thumb once it grabs the gesture, so track
        // the bar with the absolute position instead.
        const km = kmFor(gesture.moveX - pageXRef.current);
        previewRef.current = km;
        setPreview(km);
      },
      onPanResponderRelease: () => {
        setDragging(false);
        onReleaseRef.current(previewRef.current);
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        onReleaseRef.current(previewRef.current);
      },
    })
  ).current;

  // Kept in refs for the same reason as above: the responder is built once.
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;
  const pageXRef = useRef(0);

  const shown = dragging ? preview : value;
  const ratio = (shown - min) / (max - min);
  const fillWidth = Math.max(0, Math.min(1, ratio)) * width;

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Distance</Text>
        <Text style={[styles.value, { color: accentColor }]}>
          {shown >= max ? `${max}+ km` : `${shown} km`}
        </Text>
      </View>

      <View
        style={styles.trackTouch}
        onLayout={onLayout}
        onTouchStart={(e) => {
          // Bar origin in page coords, so moveX can be converted to a track offset.
          pageXRef.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        }}
        {...pan.panHandlers}
      >
        <View style={styles.track} />
        <View style={[styles.fill, { width: fillWidth, backgroundColor: accentColor }]} />
        <View
          style={[
            styles.thumb,
            { left: Math.max(0, fillWidth - THUMB / 2), borderColor: accentColor },
            dragging && styles.thumbActive,
          ]}
        />
      </View>

      <View style={styles.scaleRow}>
        <Text style={styles.scaleText}>{min} km</Text>
        <Text style={styles.scaleText}>{max}+ km</Text>
      </View>
    </View>
  );
};

const THUMB = 24;

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textSub },
  value: { fontSize: 13, fontWeight: '700' },
  // Tall enough to be a comfortable drag target even though the bar is 4px.
  trackTouch: { height: 36, justifyContent: 'center', marginTop: 6 },
  track: { height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  fill: { position: 'absolute', height: 4, borderRadius: 2 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: COLORS.card,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  thumbActive: { transform: [{ scale: 1.15 }] },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  scaleText: { fontSize: 11, color: COLORS.textMuted },
});
