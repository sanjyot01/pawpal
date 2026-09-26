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
import { apiGet, apiPost, apiPut, errorMessage } from '../utils/api';
import type { WalkNotification } from './NotificationsScreen';

interface WalkRequestDetailScreenProps {
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
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

export const WalkRequestDetailScreen: React.FC<WalkRequestDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const notif: WalkNotification | undefined = route?.params?.notif;
  const requestId = notif?.id;
  const isDate = notif?.type === 'date_request';

  const isSent = notif?.direction === 'sent';
  const otherUserId = isSent ? notif?.hostUserId : notif?.requesterUserId;
  const otherName = isSent ? notif?.hostName : notif?.requesterName;
  const otherAvatarUrl = isSent ? notif?.hostAvatarUrl : notif?.requesterAvatarUrl;

  const [expanded, setExpanded] = useState(true);
  const [localStatus, setLocalStatus] = useState(notif?.status ?? 'PENDING');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const scrollRef = useRef<ScrollView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!requestId) return;
    try {
      const data = await apiGet<ChatMessage[]>(
        `/api/messages/${isDate ? 'date-request' : 'walk-request'}/${requestId}`
      );
      setMessages(prev => (sameThread(prev, data) ? prev : data));
      setLoadError(undefined);
    } catch (e) {
      // Rendered only while the thread is empty: this polls every 4s, so a blip
      // with messages on screen stays quiet, but a thread that never loaded
      // must not read as "No messages yet. Say hi!".
      setLoadError(errorMessage(e, 'Could not load messages.'));
    }
  }, [requestId, isDate]);

  // Poll every 1 second
  useEffect(() => {
    fetchMessages();
    // 4s keeps the chat feeling live without hammering the thread endpoint every second.
    intervalRef.current = setInterval(fetchMessages, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMessages]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(async (text: string) => {
    if (!otherUserId || !requestId || !text.trim()) return;
    try {
      const sent = await apiPost<ChatMessage>('/api/messages', {
        receiverId: otherUserId,
        content: text.trim(),
        ...(isDate ? { dateRequestId: requestId } : { walkRequestId: requestId }),
      });
      setMessages(prev => [...prev, sent]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send message');
    }
    // requestId and isDate are read above, so they belong here — without them a
    // thread opened second kept sending against the first one's request id.
  }, [otherUserId, requestId, isDate]);

  const handleAction = async (status: 'ACCEPTED' | 'REJECTED' | 'BLOCKED' | 'PENDING') => {
    if (!notif?.id) return;
    try {
      await apiPut(`/api/${isDate ? 'date' : 'walk'}/requests/${notif.id}`, { status });
      setLocalStatus(status);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update request');
    }
  };

  const handleBlock = () => {
    Alert.alert('Block this user?', 'They will not be able to message you and the conversation will be closed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => handleAction('BLOCKED') },
    ]);
  };

  const handleUnblock = () => {
    Alert.alert('Unblock this user?', 'They will be able to message you again and the request reopens for you to accept or deny.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unblock', onPress: () => handleAction('PENDING') },
    ]);
  };

  const isChatClosed = localStatus === 'REJECTED' || localStatus === 'BLOCKED';
  const PENDING_MESSAGE_LIMIT = 5;
  const pendingLimitReached = localStatus === 'PENDING' && messages.length >= PENDING_MESSAGE_LIMIT;

  const speciesEmoji = notif?.requesterPetSpecies === 'CAT' ? '🐈' : '🐕';
  const tags: string[] = [];
  if (!isSent) {
    if (notif?.requesterPetIsVaccinated) tags.push('Vaccinated');
    if (notif?.requesterPetIsNeutered) tags.push('Neutered');
  }

  const durationLabel = notif?.invitationDurationMinutes
    ? notif.invitationDurationMinutes >= 60
      ? `~${Math.round(notif.invitationDurationMinutes / 60)} hour${notif.invitationDurationMinutes >= 120 ? 's' : ''}`
      : `${notif.invitationDurationMinutes} min`
    : null;

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
        <Text style={styles.headerTitle}>{isDate ? 'Date Request' : 'Walk Request'}</Text>
        <View style={[styles.walkChip, isDate && styles.dateChip]}>
          <Text style={[styles.walkChipText, isDate && styles.dateChipText]}>
            {isDate ? '💕 Date' : '🚶 Walk'}
          </Text>
        </View>
      </View>

      {/* Requester / Host Card — fixed at top */}
      <View style={styles.requesterCard}>
        <View style={styles.requesterTop}>
          <View style={styles.avatarOuter}>
            <View style={styles.avatarWrap}>
              {otherAvatarUrl ? (
                <Image source={{ uri: otherAvatarUrl }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>
                    {otherName?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.onlineDot} />
          </View>

          <View style={styles.requesterInfo}>
            <Text style={styles.requesterName}>{otherName || 'Unknown'}</Text>
            <Text style={styles.requesterMeta}>
              {isSent
                ? (isDate ? '💕 Date Invitation Host' : '🚶 Walk Invitation Host')
                : '⭐ 4.8 · 23 walks completed'}
            </Text>
            {(notif?.invitationRoute || notif?.invitationLocation) ? (
              <Text style={styles.requesterLocation}>📍 {notif.invitationRoute || notif.invitationLocation}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.dividerLine} />

        {!isSent && notif?.requesterPetName ? (
          <Text style={styles.petRow}>
            {speciesEmoji} Pet: {notif.requesterPetName}
            {notif.requesterPetBreed ? ` · ${notif.requesterPetBreed}` : ''}
            {notif.requesterPetAge ? ` · ${notif.requesterPetAge}` : ''}
          </Text>
        ) : null}

        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map(t => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Accordion toggle */}
        <TouchableOpacity
          style={styles.accordionToggle}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.85}
        >
          <Text style={styles.accordionLabel}>
            {expanded ? '▼' : '▶'} {isDate
              ? (isSent ? 'Date Details' : 'Date Details & Actions')
              : (isSent ? 'Walk Details' : 'Walk Details & Actions')}
          </Text>
          <Text style={styles.accordionHint}>{expanded ? 'Tap to collapse' : 'Tap to expand'}</Text>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.expandedContent}>
            <Text style={styles.detailsHeading}>{isDate ? 'Date Details' : 'Walk Details'}</Text>

            {(notif?.invitationRoute || notif?.invitationLocation) ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailIcon}>📍</Text>
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.detailValue}>{notif.invitationRoute || notif.invitationLocation}</Text>
              </View>
            ) : null}
            {notif?.invitationDate ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailIcon}>📅</Text>
                <Text style={styles.detailLabel}>Date</Text>
                <Text style={styles.detailValue}>{notif.invitationDate}</Text>
              </View>
            ) : null}
            {notif?.invitationTime ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailIcon}>🕐</Text>
                <Text style={styles.detailLabel}>Time</Text>
                <Text style={styles.detailValue}>{notif.invitationTime}</Text>
              </View>
            ) : null}
            {durationLabel ? (
              <View style={[styles.detailRow, styles.detailRowLast]}>
                <Text style={styles.detailIcon}>⏱</Text>
                <Text style={styles.detailLabel}>Duration</Text>
                <Text style={styles.detailValue}>{durationLabel}</Text>
              </View>
            ) : null}

            <View style={styles.actionsDivider} />

            {notif?.direction === 'received' && localStatus === 'PENDING' ? (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAction('ACCEPTED')}>
                  <Text style={styles.acceptBtnText}>✓ Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.denyBtn} onPress={() => handleAction('REJECTED')}>
                  <Text style={styles.denyBtnText}>✗ Deny</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.blockBtn} onPress={handleBlock}>
                  <Text style={styles.blockBtnText}>⊘ Block</Text>
                </TouchableOpacity>
              </View>
            ) : notif?.direction === 'received' && localStatus === 'BLOCKED' ? (
              <View style={{ gap: 10 }}>
                <View style={[styles.statusChip, styles.statusBlocked]}>
                  <Text style={[styles.statusChipText, styles.statusBlockedText]}>⊘ User Blocked</Text>
                </View>
                <TouchableOpacity style={styles.unblockBtn} onPress={handleUnblock}>
                  <Text style={styles.unblockBtnText}>Unblock User</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.statusChip,
                localStatus === 'PENDING' ? styles.statusPending
                : localStatus === 'ACCEPTED' ? styles.statusAccepted
                : localStatus === 'BLOCKED' ? styles.statusBlocked
                : styles.statusRejected]}>
                <Text style={[styles.statusChipText,
                  localStatus === 'PENDING' ? styles.statusPendingText
                  : localStatus === 'ACCEPTED' ? styles.statusAcceptedText
                  : localStatus === 'BLOCKED' ? styles.statusBlockedText
                  : styles.statusRejectedText]}>
                  {localStatus === 'PENDING' ? '⏳ Awaiting Response'
                   : localStatus === 'ACCEPTED' ? '✓ Request Accepted'
                   : localStatus === 'BLOCKED' ? '⊘ User Blocked'
                   : '✗ Request Declined'}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Messages divider — fixed */}
      <View style={styles.todayDivider}>
        <View style={styles.todayLine} />
        <Text style={styles.todayText}>Messages</Text>
        <View style={styles.todayLine} />
      </View>

      {/* Chat — scrollable */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.chatArea}>
          {messages.length === 0 && loadError ? (
            <ErrorNotice message={loadError} onRetry={fetchMessages} />
          ) : messages.length === 0 ? (
            <Text style={styles.emptyChatText}>No messages yet. Say hi!</Text>
          ) : (
            messages.map(msg => (
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
        </View>
      </ScrollView>

      {pendingLimitReached && (
        <View style={styles.limitBanner}>
          <Text style={styles.limitBannerText}>
            ⏳ 5-message limit reached while pending — {isSent ? 'wait for the host to accept' : 'accept, deny or wait to keep chatting'}.
          </Text>
        </View>
      )}
      <ChatInputBar onSend={handleSend} disabled={isChatClosed || pendingLimitReached} />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 22, color: COLORS.text },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  walkChip: { backgroundColor: '#DCFCE7', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100 },
  walkChipText: { fontSize: 12, fontWeight: '700', color: '#16A34A' },
  dateChip: { backgroundColor: COLORS.purpleLight },
  dateChipText: { color: COLORS.purple },

  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  requesterCard: {
    backgroundColor: COLORS.card,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 10,
  },
  requesterTop: { flexDirection: 'row', padding: 16, gap: 14, alignItems: 'flex-start' },
  avatarOuter: { position: 'relative', width: 72, height: 72, marginRight: 0 },
  avatarWrap: { width: 72, height: 72, borderRadius: 36, overflow: 'hidden' },
  avatarImg: { width: 72, height: 72 },
  avatarFallback: {
    width: 72, height: 72,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarFallbackText: { fontSize: 28, fontWeight: '700', color: COLORS.primary },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 0,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#22C55E', borderWidth: 2, borderColor: COLORS.card,
  },
  requesterInfo: { flex: 1, gap: 4, paddingTop: 4 },
  requesterName: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  requesterMeta: { fontSize: 13, color: COLORS.textSub },
  requesterLocation: { fontSize: 13, color: COLORS.primary, fontWeight: '500' },

  dividerLine: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 16 },
  petRow: {
    fontSize: 14, color: COLORS.text, fontWeight: '500',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  tag: { backgroundColor: COLORS.primaryLight, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100 },
  tagText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },

  accordionToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 14,
  },
  accordionLabel: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  accordionHint: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },

  expandedContent: { padding: 16, gap: 10 },
  detailsHeading: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  detailRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  detailIcon: { fontSize: 16, width: 22 },
  detailLabel: { fontSize: 13, color: COLORS.textMuted, width: 72 },
  detailValue: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '600' },
  actionsDivider: { height: 1, backgroundColor: COLORS.border, marginTop: 4, marginBottom: 4 },

  actionRow: { flexDirection: 'row', gap: 10 },
  acceptBtn: { flex: 1, backgroundColor: '#22C55E', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  acceptBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  denyBtn: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', borderWidth: 1.5, borderColor: '#EF4444',
  },
  denyBtnText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
  blockBtn: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.border,
  },
  blockBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.textMuted },
  unblockBtn: {
    backgroundColor: COLORS.card, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.primary,
  },
  unblockBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },

  statusChip: { borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  statusPending: { backgroundColor: '#FFF7ED' },
  statusAccepted: { backgroundColor: '#DCFCE7' },
  statusRejected: { backgroundColor: '#FEE2E2' },
  statusBlocked: { backgroundColor: '#F3F4F6' },
  statusChipText: { fontSize: 14, fontWeight: '700' },
  statusPendingText: { color: COLORS.primary },
  statusAcceptedText: { color: '#16A34A' },
  statusRejectedText: { color: '#EF4444' },
  statusBlockedText: { color: '#6B7280' },

  todayDivider: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, marginVertical: 12, gap: 10,
  },
  todayLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  todayText: { fontSize: 12, color: COLORS.textMuted },

  chatArea: { paddingVertical: 4, paddingBottom: 12 },
  emptyChatText: {
    textAlign: 'center', color: COLORS.textMuted, fontSize: 13,
    paddingVertical: 24,
  },
  limitBanner: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  limitBannerText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
});
