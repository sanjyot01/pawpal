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

interface MarketChat {
  itemId: string;
  otherUserId: string;
  otherUserName?: string;
  otherUserAvatarUrl?: string;
  itemName?: string;
  itemPhotoUrl?: string;
  itemPrice?: number;
  itemStatus?: string;
  isSeller?: boolean;
  lastMessage?: string;
  lastMessageAt?: string;
  lastMessageIsOwn?: boolean;
  unreadCount?: number;
}

function formatTimeAgo(iso?: string): string {
  if (!iso) return '';
  try {
    const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diffMin < 1) return 'now';
    if (diffMin < 60) return `${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    return `${Math.floor(diffH / 24)}d`;
  } catch {
    return '';
  }
}

interface MarketChatsScreenProps {
  navigation: any;
}

export const MarketChatsScreen: React.FC<MarketChatsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<MarketChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string>();

  const loadData = useCallback(async () => {
    try {
      setLoadError(undefined);
      const data = await apiGet<MarketChat[]>('/api/market/chats');
      setChats(data);
    } catch (e) {
      // A buyer who has messages but sees "no chats" will assume the seller
      // never replied, which is worse than an error.
      setLoadError(errorMessage(e, 'Could not load your chats.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  const openChat = (chat: MarketChat) => {
    navigation.navigate('MarketplaceChat', {
      item: {
        id: chat.itemId,
        name: chat.itemName,
        photoUrl: chat.itemPhotoUrl,
        price: chat.itemPrice,
        status: chat.itemStatus,
      },
      otherUserId: chat.otherUserId,
      otherUserName: chat.otherUserName,
      otherUserAvatarUrl: chat.otherUserAvatarUrl,
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Market Chats</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={chats}
        keyExtractor={(c) => `${c.itemId}|${c.otherUserId}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingTop: 8 }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} />
          ) : loadError ? (
            <ErrorNotice message={loadError} onRetry={loadData} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No chats yet. Message a seller from an item!</Text>
            </View>
          )
        }
        renderItem={({ item: chat }) => (
          <TouchableOpacity style={styles.chatRow} onPress={() => openChat(chat)} activeOpacity={0.8}>
            {/* Item thumbnail with user avatar badge */}
            <View style={styles.thumbWrap}>
              <View style={styles.thumb}>
                {chat.itemPhotoUrl ? (
                  <Image source={{ uri: chat.itemPhotoUrl }} style={styles.thumbImg} />
                ) : (
                  <Text style={styles.thumbEmoji}>📦</Text>
                )}
              </View>
              <View style={styles.avatarBadge}>
                {chat.otherUserAvatarUrl ? (
                  <Image source={{ uri: chat.otherUserAvatarUrl }} style={styles.avatarBadgeImg} />
                ) : (
                  <Text style={styles.avatarBadgeText}>
                    {chat.otherUserName?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.chatInfo}>
              <View style={styles.chatTopRow}>
                <Text style={styles.chatName} numberOfLines={1}>
                  {chat.otherUserName || 'User'}
                  {chat.isSeller ? '  ·  buying' : '  ·  selling'}
                </Text>
                <Text style={styles.chatTime}>{formatTimeAgo(chat.lastMessageAt)}</Text>
              </View>
              <Text style={styles.chatItemName} numberOfLines={1}>
                🛍 {chat.itemName || 'Item'} · ${chat.itemPrice ?? 0}
              </Text>
              <Text style={styles.chatPreview} numberOfLines={1}>
                {chat.lastMessageIsOwn ? 'You: ' : ''}{chat.lastMessage || ''}
              </Text>
            </View>

            {(chat.unreadCount ?? 0) > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{chat.unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 22, color: COLORS.primary },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyText: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 5,
    gap: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  thumbWrap: { position: 'relative', width: 56, height: 56 },
  thumb: {
    width: 56, height: 56,
    borderRadius: 12,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbEmoji: { fontSize: 26 },
  avatarBadge: {
    position: 'absolute',
    bottom: -4, right: -4,
    width: 24, height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.card,
    overflow: 'hidden',
  },
  avatarBadgeImg: { width: '100%', height: '100%' },
  avatarBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  chatInfo: { flex: 1, gap: 2 },
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatName: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 },
  chatTime: { fontSize: 11, color: COLORS.textMuted },
  chatItemName: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  chatPreview: { fontSize: 12, color: COLORS.textSub },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
});
