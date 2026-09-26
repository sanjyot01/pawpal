import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { apiPost, apiDelete, getToken } from './api';

/** Where the Expo token is kept so logout can retire it without holding a React ref. */
const PUSH_TOKEN_KEY = 'push_token';

/** The `data` block PushNotificationService attaches to every message. */
export interface PushPayload {
  notificationId?: string;
  category?: string;
  relatedType?: string;
  relatedId?: number;
}

/**
 * expo-notifications and expo-device are native modules. A JS bundle can be newer
 * than the installed native build (Metro serves JS without recompiling), and a
 * static import would then crash the whole app on a missing native module rather
 * than just disabling push. Loading them lazily degrades to "no push" instead.
 */
function loadNativeModules(): { Notifications: any; Device: any } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return { Notifications: require('expo-notifications'), Device: require('expo-device') };
  } catch {
    return null;
  }
}

const native = loadNativeModules();
const Notifications = native?.Notifications;
const Device = native?.Device;

/**
 * Android push wiring.
 *
 * Channel ids MUST match the ones the backend sets on each message
 * (PushNotificationService.channelFor). Android drops a notification whose
 * channel the app never created — silently, with no error on either side — so a
 * mismatch here looks exactly like "push is broken".
 */
// Android importance values are platform constants, spelled out here rather than
// read off the native module so this file is safe to load when push is unavailable.
const IMPORTANCE_HIGH = 4;
const IMPORTANCE_DEFAULT = 3;

export const CHANNELS = {
  messages: {
    name: 'Messages',
    description: 'Someone replied to you',
    importance: IMPORTANCE_HIGH,
  },
  requests: {
    name: 'Walk & date requests',
    description: 'Someone wants to walk or meet up',
    importance: IMPORTANCE_HIGH,
  },
  social: {
    name: 'Social',
    description: 'Matches, reviews and marketplace activity',
    importance: IMPORTANCE_DEFAULT,
  },
} as const;

// Foreground behaviour: still show the banner, because the in-app screens don't
// all live-refresh and a silent drop reads as a lost message.
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

async function createChannels() {
  if (Platform.OS !== 'android' || !Notifications) return;
  await Promise.all(
    Object.entries(CHANNELS).map(([id, cfg]) =>
      Notifications.setNotificationChannelAsync(id, {
        name: cfg.name,
        description: cfg.description,
        importance: cfg.importance,
        // Matches the "high priority = wakes the device" categories on the server.
        lockscreenVisibility: 1 /* PRIVATE */,
        vibrationPattern: [0, 250, 250, 250],
      }),
    ),
  );
}

/** Returns the Expo push token, or null if unavailable (denied, or an emulator without Play Services). */
export async function registerForPush(): Promise<string | null> {
  try {
    if (!Notifications) {
      // JS bundle is ahead of the installed native build; push stays off rather
      // than taking the app down with it.
      console.log('[push] expo-notifications not in this native build — push disabled');
      return null;
    }
    // Channels first: a token is useless if the channel it targets doesn't exist.
    await createChannels();

    // iOS simulators genuinely cannot receive remote push. Android emulators can,
    // provided the system image bundles Play Services (a "Google Play" AVD), which
    // is what makes push testable without a physical handset.
    if (Device && !Device.isDevice && Platform.OS !== 'android') {
      console.log('[push] simulator — channels created, skipping token');
      return null;
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    // Android 13+ requires an explicit POST_NOTIFICATIONS grant.
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') {
      console.log('[push] permission denied');
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    // Only register once we actually hold an auth token, or the call 401s.
    if (await getToken()) {
      await apiPost('/api/notifications/device-token', { token, platform: 'ANDROID' });
      // Persisted so sign-out can name the token to retire from any screen.
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
      console.log('[push] registered token with backend');
    }
    return token;
  } catch (e) {
    // Push must never break app start.
    console.log('[push] registration failed:', e);
    return null;
  }
}

/**
 * Call on logout, before the auth token is cleared — the DELETE is authenticated, so
 * clearing first turns this into a 401 and leaves the device subscribed to the previous
 * account's notifications.
 *
 * The token is read from storage rather than passed in, so any screen can call this, and
 * the request carries it in the body because that is what the endpoint validates on.
 */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (token) {
      await apiDelete('/api/notifications/device-token', { token, platform: 'ANDROID' });
    }
  } catch (e) {
    // Best-effort: a failure here must not block someone from signing out.
    console.log('[push] unregister failed:', e);
  } finally {
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  }
}

/**
 * Registers for push and routes taps. Mount once behind auth (TabNavigator),
 * alongside useTelemetryPing.
 *
 * The handler receives the whole data block rather than just relatedType/relatedId,
 * because category is what distinguishes a walk request from a blind-date one and both
 * carry the same relatedType. It is held in a ref so a caller passing an inline arrow
 * function doesn't tear down and re-subscribe the listener on every render.
 */
export function usePushNotifications(onDeepLink?: (payload: PushPayload) => void) {
  const tokenRef = useRef<string | null>(null);
  const handlerRef = useRef(onDeepLink);
  handlerRef.current = onDeepLink;

  useEffect(() => {
    registerForPush().then((t) => (tokenRef.current = t));
    if (!Notifications) return;

    const handle = (response: any) => {
      const payload = response?.notification?.request?.content?.data as PushPayload | undefined;
      if (payload && handlerRef.current) {
        handlerRef.current(payload);
      }
    };

    // Tapping a notification should land on the thing it is about, not the home tab.
    const sub = Notifications.addNotificationResponseReceivedListener(handle);

    // A tap that launched the app from cold has already been delivered by the time this
    // listener attaches, so it arrives here instead — without this, deep links work only
    // when the app was already running.
    let cancelled = false;
    Notifications.getLastNotificationResponseAsync?.()
      .then((response: any) => {
        if (!cancelled && response) handle(response);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return tokenRef;
}