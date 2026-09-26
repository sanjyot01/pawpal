import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { ChatBubble } from '../components/ChatBubble';
import { ChatInputBar } from '../components/ChatInputBar';

interface NotificationDetailScreenProps {
  navigation: any;
  route: any;
}

const CHAT_MESSAGES = [
  {
    id: '1',
    message: "Hi! I saw Buddy's profile — he's so adorable! I think Luna and Buddy would make a great pair for a blind date 💕",
    isOwn: false,
    time: '2 min ago',
    avatar: '👩',
  },
  {
    id: '2',
    message: "Thank you! Buddy is very friendly and gets along well with cats. Luna looks so elegant in her photos! 😊",
    isOwn: true,
    time: '1 min ago',
  },
  {
    id: '3',
    message: 'Perfect! Luna is calm and gentle too. Would this weekend work for a meet-up at the park? 🌿',
    isOwn: false,
    time: 'Just now',
    avatar: '👩',
  },
];

export const NotificationDetailScreen: React.FC<NotificationDetailScreenProps> = ({
  navigation,
}) => {
  const insets = useSafeAreaInsets();

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
        <Text style={styles.headerTitle}>Blind Date Request</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Sender Card — tappable to OwnerProfile */}
        <TouchableOpacity
          style={styles.senderCard}
          onPress={() => navigation.navigate('OwnerProfile')}
          activeOpacity={0.85}
        >
          <View style={styles.senderTop}>
            <View style={styles.senderAvatar}>
              <Text style={styles.senderAvatarText}>👩</Text>
            </View>
            <View style={styles.senderInfo}>
              <Text style={styles.senderName}>Luna's Owner</Text>
              <Text style={styles.senderMeta}>📍 0.4 km away · ⭐ 4.7</Text>
              <View style={styles.petRow}>
                <Text style={styles.petEmoji}>🐱</Text>
                <Text style={styles.petInfo}>Luna · Persian Cat · 2y · ♀</Text>
              </View>
            </View>
            <View style={styles.tapHintBadge}>
              <Text style={styles.tapHintText}>View Profile ›</Text>
            </View>
          </View>
          <View style={styles.petTagsRow}>
            {['Calm', 'Indoor', 'Vaccinated', 'Gentle'].map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.acceptBtn}>
            <Text style={styles.acceptBtnText}>✅ Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.denyBtn}>
            <Text style={styles.denyBtnText}>❌ Deny</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.blockBtn}>
            <Text style={styles.blockBtnText}>🚫 Block</Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <Text style={styles.dividerText}>Messages</Text>
        </View>

        {/* Chat Bubbles */}
        <View style={styles.chatArea}>
          {CHAT_MESSAGES.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={msg.message}
              timestamp={msg.time}
              isOwn={msg.isOwn}
              avatarEmoji={msg.avatar}
            />
          ))}
        </View>
      </ScrollView>

      {/* Chat Input */}
      <ChatInputBar />
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  senderCard: {
    backgroundColor: COLORS.card,
    margin: 16,
    borderRadius: 20,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  senderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  senderAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderAvatarText: {
    fontSize: 28,
  },
  senderInfo: {
    flex: 1,
    gap: 3,
  },
  senderName: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  senderMeta: {
    fontSize: 13,
    color: COLORS.textSub,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  petEmoji: {
    fontSize: 14,
  },
  petInfo: {
    fontSize: 13,
    color: COLORS.textSub,
    fontWeight: '500',
  },
  tapHintBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.purpleLight,
    borderRadius: 100,
    alignSelf: 'flex-start',
  },
  tapHintText: {
    fontSize: 11,
    color: COLORS.purple,
    fontWeight: '600',
  },
  petTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: COLORS.purpleLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  tagText: {
    fontSize: 12,
    color: COLORS.purple,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 8,
  },
  acceptBtn: {
    flex: 1,
    backgroundColor: COLORS.green,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  acceptBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  denyBtn: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  denyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.red,
  },
  blockBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  blockBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSub,
  },
  divider: {
    alignItems: 'center',
    marginVertical: 10,
  },
  dividerText: {
    fontSize: 12,
    color: COLORS.textMuted,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 12,
  },
  chatArea: {
    paddingVertical: 8,
  },
});
