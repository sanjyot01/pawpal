import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { ChatBubble } from '../components/ChatBubble';
import { ChatInputBar } from '../components/ChatInputBar';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiGet, apiPost, errorMessage } from '../utils/api';
import { categoryEmoji, conditionLabel } from '../constants/market';
import { ImageViewerModal } from '../components/ImageViewerModal';

interface MarketplaceChatScreenProps {
  navigation: any;
  route: any;
}

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
  senderName?: string;
  senderAvatarUrl?: string;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * The 4s poll returns a fresh array every tick, so calling setMessages with it
 * re-rendered the whole thread (and everything below it) even when nothing had
 * changed. Compare identity by id + read state and keep the previous array when
 * they match, so a quiet conversation stops re-rendering entirely.
 */
function sameThread(a: ChatMessage[], b: ChatMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].isOwn !== b[i].isOwn || a[i].content !== b[i].content) {
      return false;
    }
  }
  return true;
}

export const MarketplaceChatScreen: React.FC<MarketplaceChatScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const item = route?.params?.item;
  const otherUserId: string | undefined = route?.params?.otherUserId ?? item?.sellerUserId;
  const otherUserNameParam: string | undefined = route?.params?.otherUserName ?? item?.sellerName;
  const otherUserAvatarParam: string | undefined = route?.params?.otherUserAvatarUrl ?? item?.sellerAvatarUrl;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const scrollRef = useRef<ScrollView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fallback: derive the other party's info from the first incoming message
  const firstIncoming = messages.find(m => !m.isOwn);
  const otherName = otherUserNameParam || firstIncoming?.senderName || 'Seller';
  const otherAvatarUrl = otherUserAvatarParam || firstIncoming?.senderAvatarUrl;

  const fetchMessages = useCallback(async () => {
    if (!item?.id || !otherUserId) return;
    try {
      const data = await apiGet<ChatMessage[]>(`/api/messages/market-item/${item.id}/${otherUserId}`);
      setMessages(prev => (sameThread(prev, data) ? prev : data));
      setLoadError(undefined);
    } catch (e) {
      // Only surfaced when the thread is still empty (see render): this runs on
      // a 4s poll, so a blip with messages already on screen should stay quiet,
      // but a thread that never loaded must not look like "no messages yet".
      setLoadError(errorMessage(e, 'Could not load messages.'));
    }
  }, [item?.id, otherUserId]);

  useEffect(() => {
    fetchMessages();
    // 4s keeps the chat feeling live without hammering the thread endpoint every second.
    intervalRef.current = setInterval(fetchMessages, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(async (text: string) => {
    if (!otherUserId || !item?.id || !text.trim()) return;
    try {
      const sent = await apiPost<ChatMessage>('/api/messages', {
        receiverId: otherUserId,
        content: text.trim(),
        marketItemId: item.id,
      });
      setMessages(prev => [...prev, sent]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send message');
    }
  }, [otherUserId, item?.id]);

  const isSold = item?.status === 'SOLD';
  const images: string[] = item?.imageUrls?.length ? item.imageUrls : (item?.photoUrl ? [item.photoUrl] : []);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const openViewer = (index: number) => { setViewerIndex(index); setViewerVisible(true); };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            {otherAvatarUrl ? (
              <Image source={{ uri: otherAvatarUrl }} style={styles.headerAvatarImg} />
            ) : (
              <Text style={styles.headerAvatarText}>
                {otherName?.[0]?.toUpperCase() ?? '👤'}
              </Text>
            )}
          </View>
          <View>
            <Text style={styles.headerName}>{otherName}</Text>
            <View style={styles.onlineRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Online now</Text>
            </View>
          </View>
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Item Card */}
        <View style={styles.itemCard}>
          <View style={styles.itemCardInner}>
            <TouchableOpacity
              style={styles.itemImageBox}
              activeOpacity={images.length ? 0.85 : 1}
              onPress={() => images.length && openViewer(0)}
            >
              {images.length ? (
                <Image source={{ uri: images[0] }} style={styles.itemPhoto} />
              ) : (
                <Text style={styles.itemEmoji}>{categoryEmoji(item?.category)}</Text>
              )}
            </TouchableOpacity>
            <View style={styles.itemDetails}>
              <Text style={styles.itemName}>{item?.name || 'Item'}</Text>
              {item?.condition ? (
                <Text style={styles.itemCondition}>Condition: {conditionLabel(item.condition)}</Text>
              ) : null}
              {item?.location ? (
                <Text style={styles.itemLocation} numberOfLines={1}>📍 {item.location}</Text>
              ) : null}
              <View style={styles.itemPriceRow}>
                <Text style={styles.itemPrice}>${item?.price ?? 0}</Text>
                {item?.originalPrice != null && (
                  <Text style={styles.itemOriginalPrice}>${item.originalPrice}</Text>
                )}
                <View style={[styles.availableBadge, isSold && styles.soldBadge]}>
                  <View style={[styles.availableDot, isSold && styles.soldDot]} />
                  <Text style={[styles.availableText, isSold && styles.soldBadgeText]}>
                    {isSold ? 'Sold' : 'Available'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          {images.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.itemGalleryRow}
            >
              {images.map((uri, i) => (
                <TouchableOpacity key={uri + i} onPress={() => openViewer(i)} activeOpacity={0.85}>
                  <Image source={{ uri }} style={styles.itemGalleryThumb} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Chat Messages */}
        {messages.length === 0 && loadError ? (
          <ErrorNotice message={loadError} onRetry={fetchMessages} />
        ) : messages.length === 0 ? (
          <Text style={styles.emptyChatText}>No messages yet. Ask about the item!</Text>
        ) : (
          messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={msg.content}
              timestamp={formatTime(msg.createdAt)}
              isOwn={msg.isOwn}
              avatarUrl={msg.isOwn ? undefined : msg.senderAvatarUrl}
              avatarEmoji={msg.isOwn ? undefined : '👤'}
            />
          ))
        )}
      </ScrollView>

      {/* Chat Input */}
      <ChatInputBar onSend={handleSend} />

      <ImageViewerModal
        visible={viewerVisible}
        images={images}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 22,
    color: COLORS.primary,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  headerAvatarImg: { width: '100%', height: '100%' },
  headerAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  headerName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.green,
  },
  onlineText: {
    fontSize: 12,
    color: COLORS.green,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  itemCard: {
    margin: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    backgroundColor: COLORS.card,
    overflow: 'hidden',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  itemCardInner: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
  },
  itemImageBox: {
    width: 70,
    height: 70,
    borderRadius: 14,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  itemPhoto: { width: '100%', height: '100%' },
  itemEmoji: {
    fontSize: 38,
  },
  itemGalleryRow: {
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  itemGalleryThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
  },
  itemDetails: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  itemCondition: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  itemLocation: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  itemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  itemOriginalPrice: {
    fontSize: 13,
    color: COLORS.textMuted,
    textDecorationLine: 'line-through',
  },
  availableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    backgroundColor: COLORS.primaryLight,
  },
  availableDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  availableText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
  soldBadge: {
    backgroundColor: '#F3F4F6',
    borderColor: COLORS.border,
  },
  soldDot: { backgroundColor: COLORS.textMuted },
  soldBadgeText: { color: COLORS.textMuted },
  emptyChatText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 13,
    paddingVertical: 24,
  },
});
