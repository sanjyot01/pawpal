import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants/colors';
import { NotifItem } from '../components/NotifItem';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiGet, errorMessage } from '../utils/api';

export interface WalkNotification {
  id: string;
  type: string; // 'walk_request' | 'date_request'
  direction?: 'received' | 'sent';
  status: string;
  createdAt: string;
  message?: string;
  invitationId: string;
  invitationRoute?: string;
  invitationLocation?: string;
  invitationDate?: string;
  invitationTime?: string;
  invitationDurationMinutes?: number;
  // Received (host view): requester info
  requesterUserId?: string;
  requesterName?: string;
  requesterAvatarUrl?: string;
  requesterPetName?: string;
  requesterPetSpecies?: string;
  requesterPetBreed?: string;
  requesterPetAge?: string;
  requesterPetPhotoUrl?: string;
  requesterPetIsVaccinated?: boolean;
  requesterPetIsNeutered?: boolean;
  // Sent (requester view): host/poster info
  hostUserId?: string;
  hostName?: string;
  hostAvatarUrl?: string;
  hostPetName?: string;
  hostPetSpecies?: string;
  hostPetBreed?: string;
  hostPetPhotoUrl?: string;
  unreadMessageCount?: number;
}

function formatTimeAgo(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  } catch {
    return '';
  }
}

interface NotificationsScreenProps {
  navigation: any;
  route?: any;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const filter: 'walk' | 'date' | undefined = route?.params?.filter;
  const [notifications, setNotifications] = useState<WalkNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string>();

  const loadData = useCallback(async () => {
    try {
      setLoadError(undefined);
      // Each half used to swallow its own failure and resolve to [], so the
      // outer catch never fired and a total outage rendered as "no
      // notifications yet". Both halves hit the same backend, so letting a
      // failure propagate is the honest signal.
      const [walk, date] = await Promise.all([
        filter === 'date'
          ? Promise.resolve([] as WalkNotification[])
          : apiGet<WalkNotification[]>('/api/walk/notifications'),
        filter === 'walk'
          ? Promise.resolve([] as WalkNotification[])
          : apiGet<WalkNotification[]>('/api/date/notifications'),
      ]);
      const merged = [...walk, ...date].sort((a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      );
      setNotifications(merged);
    } catch (e) {
      setLoadError(errorMessage(e, 'Could not load notifications.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  const isNew = (n: WalkNotification) =>
    n.direction === 'sent' ? (n.unreadMessageCount ?? 0) > 0 : n.status === 'PENDING';

  const newNotifs = notifications.filter(isNew);
  const earlierNotifs = notifications.filter(n => !isNew(n));

  const sections = [
    ...(newNotifs.length > 0 ? [{ title: 'NEW', data: newNotifs }] : []),
    ...(earlierNotifs.length > 0 ? [{ title: 'EARLIER', data: earlierNotifs }] : []),
  ];

  const toNotifItem = (n: WalkNotification) => {
    const isSent = n.direction === 'sent';
    const isDate = n.type === 'date_request';
    const avatarUrl = isSent ? n.hostAvatarUrl : n.requesterAvatarUrl;
    const senderName = isSent ? (n.hostName || 'Host') : (n.requesterName || 'Someone');
    const petEmoji = isSent
      ? (isDate ? '💕' : '🚶')
      : (n.requesterPetSpecies === 'CAT' ? '🐈' : '🐕');
    const place = n.invitationRoute || n.invitationLocation;
    const preview = isDate
      ? (isSent
          ? `You sent a date request${n.hostPetName ? ` for ${n.hostPetName}` : ''}${n.invitationDate ? ` · ${n.invitationDate}` : ''}`
          : `wants a date with your pet${place ? ` at ${place}` : ''}${n.invitationDate ? ` · ${n.invitationDate}` : ''}`)
      : (isSent
          ? `You sent a walk request${place ? ` for ${place}` : ''}${n.invitationDate ? ` · ${n.invitationDate}` : ''}`
          : `wants to join your walk${place ? ` on ${place}` : ''}${n.invitationDate ? ` · ${n.invitationDate}` : ''}`);
    const requestLabel = isDate ? 'Date Request' : 'Walk Request';
    const categoryLabel = isSent
      ? (n.status === 'PENDING' ? 'Pending' : n.status === 'ACCEPTED' ? 'Accepted ✓' : n.status === 'BLOCKED' ? 'Blocked' : 'Declined')
      : (n.status === 'PENDING' ? requestLabel : n.status === 'ACCEPTED' ? 'Accepted ✓' : 'Declined');

    return {
      id: n.id,
      category: (isDate ? 'blind_date' : 'walk_request') as 'blind_date' | 'walk_request',
      emoji: isDate ? '💕' : '🐾',
      avatarUrl,
      senderName,
      petName: isSent ? '' : (n.requesterPetName || ''),
      petEmoji,
      time: formatTimeAgo(n.createdAt),
      preview,
      isNew: isNew(n),
      categoryLabel,
    };
  };

  return (
    <SectionList
      style={styles.container}
      sections={sections}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      ListHeaderComponent={
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {filter === 'walk' ? '🚶 Walk Notifications' : filter === 'date' ? '💕 Date Notifications' : 'Notifications'}
          </Text>
          <View style={styles.backBtn} />
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} />
        ) : loadError ? (
          <ErrorNotice message={loadError} onRetry={loadData} />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No notifications yet.</Text>
          </View>
        )
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionLabel}>{section.title}</Text>
      )}
      renderItem={({ item }) => (
        <NotifItem
          item={toNotifItem(item)}
          onPress={() => navigation.navigate('WalkRequestDetail', { notif: item, expanded: false })}
        />
      )}
      contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  listContent: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 22,
    color: COLORS.primary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: 4,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textMuted,
  },
});
