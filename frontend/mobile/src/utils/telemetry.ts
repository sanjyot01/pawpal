import { useEffect } from 'react';
import * as Location from 'expo-location';
import { apiPost, getUserId } from './api';

const PING_INTERVAL_MS = 3 * 60 * 1000;

async function sendLocationPing() {
  try {
    const userId = await getUserId();
    if (!userId) return;
    // Never prompt from a background ping — only report if permission already granted.
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await apiPost('/api/telemetry/location', {
      userId,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    });
  } catch {
    // Telemetry is best-effort; never surface errors to the user.
  }
}

/**
 * Feeds the backend's Kafka → Redis geo index (users:geo) with real positions
 * while the app is open. Mount once behind auth (TabNavigator).
 */
export function useTelemetryPing() {
  useEffect(() => {
    sendLocationPing();
    const interval = setInterval(sendLocationPing, PING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
}
