import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { apiPost } from '../utils/api';
import { DateFeedItem } from './PetBlindDateScreen';
import { ImageViewerModal } from '../components/ImageViewerModal';

interface DatePetProfileScreenProps {
  navigation: any;
  route: any;
}

export const DatePetProfileScreen: React.FC<DatePetProfileScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const feedItem: DateFeedItem = route?.params?.feedItem;
  const alreadyRequested: boolean = route?.params?.alreadyRequested ?? false;
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(alreadyRequested);
  const [dialog, setDialog] = useState<{ visible: boolean; success: boolean; message: string }>({
    visible: false, success: true, message: '',
  });
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const images = feedItem?.imageUrls ?? [];
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (dialog.visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
    }
  }, [dialog.visible]);

  const petName = feedItem?.petName || '—';
  const ownerName = feedItem?.ownerName || '—';

  const showDialog = (success: boolean, message: string) =>
    setDialog({ visible: true, success, message });
  const closeDialog = () => setDialog(d => ({ ...d, visible: false }));

  const handleSendRequest = async () => {
    if (sent) return;
    try {
      setSending(true);
      await apiPost('/api/date/requests', { invitationId: feedItem.id });
      setSent(true);
      showDialog(true, `Your date request for ${petName} has been sent to ${ownerName}. They'll be notified shortly.`);
    } catch (e: any) {
      showDialog(false, e.message || 'Failed to send request. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const petMetaLine = [
    feedItem?.petBreed,
    feedItem?.petAge,
    feedItem?.petGender === 'FEMALE' ? 'Female' : feedItem?.petGender === 'MALE' ? 'Male' : '',
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — pet photo */}
        <View style={[styles.hero, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          {feedItem?.petProfilePhotoUrl ? (
            <Image source={{ uri: feedItem.petProfilePhotoUrl }} style={styles.heroImage} />
          ) : (
            <View style={styles.heroAvatarFallback}>
              <Text style={styles.heroAvatarEmoji}>
                {feedItem?.petSpecies === 'CAT' ? '🐱' : '🐕'}
              </Text>
            </View>
          )}
        </View>

        {/* Looking badge */}
        <View style={styles.availableWrap}>
          <View style={styles.availableBadge}>
            <View style={styles.availableDot} />
            <Text style={styles.availableText}>Looking for a Date</Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.contentCard}>
          <Text style={styles.petNameLarge}>{petName}</Text>
          {petMetaLine ? <Text style={styles.petMetaLine}>{petMetaLine}</Text> : null}

          <View style={styles.divider} />

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statIcon}>🎂</Text>
              <Text style={styles.statValue}>{feedItem?.petAge || '—'}</Text>
              <Text style={styles.statLabel}>Age</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statIcon}>{feedItem?.petGender === 'FEMALE' ? '♀' : '♂'}</Text>
              <Text style={styles.statValue}>
                {feedItem?.petGender === 'FEMALE' ? 'Female' : feedItem?.petGender === 'MALE' ? 'Male' : '—'}
              </Text>
              <Text style={styles.statLabel}>Gender</Text>
            </View>
          </View>

          {/* Health tags */}
          {(feedItem?.petIsVaccinated || feedItem?.petIsNeutered) && (
            <View style={styles.tagsRow}>
              {feedItem.petIsVaccinated && (
                <View style={styles.tag}><Text style={styles.tagText}>✅ Vaccinated</Text></View>
              )}
              {feedItem.petIsNeutered && (
                <View style={styles.tag}><Text style={styles.tagText}>✔ Neutered</Text></View>
              )}
            </View>
          )}

          {/* Date invitation details */}
          <Text style={styles.sectionTitle}>💕 Date Invitation</Text>
          <View style={styles.invitationCard}>
            <View style={styles.invRow}>
              <Text style={styles.invIcon}>📍</Text>
              <Text style={styles.invText}>{feedItem?.location || '—'}</Text>
            </View>
            <View style={styles.invRow}>
              <Text style={styles.invIcon}>🗓</Text>
              <Text style={styles.invText}>
                {[feedItem?.date, feedItem?.time].filter(Boolean).join(' · ') || '—'}
              </Text>
            </View>
          </View>

          {/* Photos */}
          {images.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>📸 Photos</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoScrollContent}
              >
                {images.map((uri, i) => (
                  <TouchableOpacity
                    key={uri + i}
                    onPress={() => { setViewerIndex(i); setViewerVisible(true); }}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri }} style={styles.photoThumb} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Message from owner */}
          {feedItem?.message ? (
            <>
              <Text style={styles.sectionTitle}>💬 Message from {ownerName}</Text>
              <View style={styles.messageCard}>
                <Text style={styles.messageQuote}>"</Text>
                <Text style={styles.messageText}>{feedItem.message}</Text>
              </View>
            </>
          ) : null}

          {/* Owner */}
          <Text style={styles.sectionTitle}>👤 Owner</Text>
          <View style={styles.ownerRow}>
            {feedItem?.ownerAvatarUrl ? (
              <Image source={{ uri: feedItem.ownerAvatarUrl }} style={styles.ownerAvatarImg} />
            ) : (
              <View style={styles.ownerAvatar}>
                <Text style={styles.ownerAvatarText}>{ownerName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.ownerName}>{ownerName}</Text>
          </View>
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.ctaBtn, (sending || sent) && styles.ctaBtnSent]}
          onPress={handleSendRequest}
          disabled={sending || sent}
        >
          {sending
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.ctaText}>{sent ? '✓  Request Sent' : 'Send Date Request 💕'}</Text>}
        </TouchableOpacity>
      </View>

      {/* Result dialog */}
      <Modal visible={dialog.visible} transparent animationType="none" statusBarTranslucent>
        <View style={styles.overlay}>
          <Animated.View style={[styles.dialogCard, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
            <View style={[styles.dialogIcon, dialog.success ? styles.dialogIconSuccess : styles.dialogIconError]}>
              <Text style={styles.dialogIconText}>{dialog.success ? '💕' : '⚠️'}</Text>
            </View>
            <Text style={styles.dialogTitle}>
              {dialog.success ? 'Request Sent!' : 'Something went wrong'}
            </Text>
            <Text style={styles.dialogMessage}>{dialog.message}</Text>
            {dialog.success && (
              <View style={styles.dialogOwnerChip}>
                {feedItem?.ownerAvatarUrl ? (
                  <Image source={{ uri: feedItem.ownerAvatarUrl }} style={styles.dialogOwnerAvatar} />
                ) : (
                  <View style={styles.dialogOwnerAvatarFallback}>
                    <Text style={styles.dialogOwnerInitial}>{ownerName.charAt(0)}</Text>
                  </View>
                )}
                <Text style={styles.dialogOwnerName}>{ownerName}</Text>
              </View>
            )}
            <View style={styles.dialogActions}>
              {dialog.success ? (
                <TouchableOpacity
                  style={styles.dialogBtnPrimary}
                  onPress={() => { closeDialog(); navigation.goBack(); }}
                >
                  <Text style={styles.dialogBtnPrimaryText}>Awesome! 🎉</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity style={styles.dialogBtnSecondary} onPress={closeDialog}>
                    <Text style={styles.dialogBtnSecondaryText}>Dismiss</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dialogBtnPrimary} onPress={() => { closeDialog(); handleSendRequest(); }}>
                    <Text style={styles.dialogBtnPrimaryText}>Try Again</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Animated.View>
        </View>
      </Modal>

      <ImageViewerModal
        visible={viewerVisible}
        images={images}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  hero: {
    backgroundColor: COLORS.purpleLight,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    position: 'absolute',
    top: 52, left: 20,
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  backArrow: { fontSize: 20, color: COLORS.text, fontWeight: '600' },
  heroImage: {
    width: 130, height: 130,
    borderRadius: 65,
    marginTop: 20,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  heroAvatarFallback: {
    width: 130, height: 130,
    borderRadius: 65,
    marginTop: 20,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  heroAvatarEmoji: { fontSize: 56 },
  availableWrap: { alignItems: 'center', marginTop: -18, zIndex: 10 },
  availableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  availableDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.purple },
  availableText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  contentCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 12,
    padding: 24,
    paddingBottom: 8,
  },
  petNameLarge: { fontSize: 26, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  petMetaLine: { fontSize: 14, color: COLORS.textSub, marginBottom: 16 },
  divider: { height: 1, backgroundColor: COLORS.border, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statIcon: { fontSize: 18 },
  statValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textMuted },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  invitationCard: {
    backgroundColor: COLORS.purpleLight,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  invRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  invIcon: { fontSize: 16, width: 20 },
  invText: { fontSize: 14, color: COLORS.text, flex: 1 },
  photoScrollContent: { gap: 10, paddingBottom: 20 },
  photoThumb: { width: 96, height: 96, borderRadius: 14, backgroundColor: COLORS.bg },
  messageCard: {
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    padding: 16,
    paddingTop: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.purple,
  },
  messageQuote: { fontSize: 24, color: COLORS.purple, fontWeight: '800', lineHeight: 26 },
  messageText: { fontSize: 14, color: COLORS.text, lineHeight: 21, fontStyle: 'italic' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  tag: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  tagText: { fontSize: 13, color: '#15803D', fontWeight: '500' },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  ownerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#EDE9FE',
    alignItems: 'center', justifyContent: 'center',
  },
  ownerAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  ownerAvatarText: { fontSize: 18, fontWeight: '700', color: COLORS.purple },
  ownerName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  ctaWrap: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
  },
  ctaBtn: {
    backgroundColor: COLORS.purple,
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  ctaBtnSent: {
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
  },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },

  // Dialog
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dialogCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  dialogIcon: {
    width: 80, height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  dialogIconSuccess: { backgroundColor: COLORS.purpleLight, borderWidth: 2, borderColor: '#DDD6FE' },
  dialogIconError: { backgroundColor: '#FEF2F2', borderWidth: 2, borderColor: '#FECACA' },
  dialogIconText: { fontSize: 36 },
  dialogTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  dialogMessage: {
    fontSize: 14,
    color: COLORS.textSub,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  dialogOwnerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.bg,
    borderRadius: 100,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  dialogOwnerAvatar: { width: 32, height: 32, borderRadius: 16 },
  dialogOwnerAvatarFallback: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.purple,
    alignItems: 'center', justifyContent: 'center',
  },
  dialogOwnerInitial: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  dialogOwnerName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  dialogBtnPrimary: {
    flex: 1,
    backgroundColor: COLORS.purple,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  dialogBtnPrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  dialogBtnSecondary: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dialogBtnSecondaryText: { color: COLORS.textSub, fontSize: 15, fontWeight: '600' },
});
