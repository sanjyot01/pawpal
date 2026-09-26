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
import { WalkFeedItem } from './FindPartnersScreen';

interface ConnectPetProfileScreenProps {
  navigation: any;
  route: any;
}

export const ConnectPetProfileScreen: React.FC<ConnectPetProfileScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const feedItem: WalkFeedItem = route?.params?.feedItem;
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [dialog, setDialog] = useState<{ visible: boolean; success: boolean; message: string }>({
    visible: false, success: true, message: '',
  });
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

  const ownerName = feedItem?.ownerName || '—';
  const pets = feedItem?.pets ?? [];

  const showDialog = (success: boolean, message: string) =>
    setDialog({ visible: true, success, message });
  const closeDialog = () => setDialog(d => ({ ...d, visible: false }));

  const handleSendRequest = async () => {
    if (sent) return;
    try {
      setSending(true);
      await apiPost('/api/walk/requests', { invitationId: feedItem.id });
      setSent(true);
      showDialog(true, `Your walk request has been sent to ${ownerName}. They'll be notified shortly.`);
    } catch (e: any) {
      showDialog(false, e.message || 'Failed to send request. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — owner avatar */}
        <View style={[styles.hero, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          {feedItem?.ownerAvatarUrl ? (
            <Image source={{ uri: feedItem.ownerAvatarUrl }} style={styles.heroImage} />
          ) : (
            <View style={styles.heroAvatarFallback}>
              <Text style={styles.heroAvatarText}>{ownerName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>

        {/* Available badge */}
        <View style={styles.availableWrap}>
          <View style={styles.availableBadge}>
            <View style={styles.availableDot} />
            <Text style={styles.availableText}>Available</Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.contentCard}>
          <Text style={styles.ownerNameLarge}>{ownerName}</Text>

          <View style={styles.divider} />

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statIcon}>🐾</Text>
              <Text style={styles.statValue}>{pets.length}</Text>
              <Text style={styles.statLabel}>Pets</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statIcon}>⏱</Text>
              <Text style={styles.statValue}>{feedItem?.durationMinutes ? `${feedItem.durationMinutes}m` : '—'}</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statIcon}>👥</Text>
              <Text style={styles.statValue}>{feedItem?.spotsLeft ?? '—'}</Text>
              <Text style={styles.statLabel}>Spots Left</Text>
            </View>
          </View>

          {/* Walk invitation details */}
          {feedItem && (
            <>
              <Text style={styles.sectionTitle}>Walking Invitation</Text>
              <View style={styles.invitationCard}>
                <View style={styles.invRow}>
                  <Text style={styles.invIcon}>📍</Text>
                  <Text style={styles.invText}>{feedItem.route || '—'}</Text>
                </View>
                <View style={styles.invRow}>
                  <Text style={styles.invIcon}>🗓</Text>
                  <Text style={styles.invText}>{feedItem.date} · {feedItem.time}</Text>
                </View>
                {feedItem.durationMinutes > 0 && (
                  <View style={styles.invRow}>
                    <Text style={styles.invIcon}>⏱</Text>
                    <Text style={styles.invText}>{feedItem.durationMinutes} min</Text>
                  </View>
                )}
                {feedItem.distanceLabel ? (
                  <View style={styles.invRow}>
                    <Text style={styles.invIcon}>📏</Text>
                    <Text style={styles.invText}>{feedItem.distanceLabel} away</Text>
                  </View>
                ) : null}
                {feedItem.message ? (
                  <View style={styles.invRow}>
                    <Text style={styles.invIcon}>💬</Text>
                    <Text style={styles.invText}>{feedItem.message}</Text>
                  </View>
                ) : null}
              </View>
            </>
          )}

          {/* Pets */}
          {pets.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>🐾 Pets Going on the Walk</Text>
              {pets.map(pet => {
                const petTags: string[] = [];
                if (pet.petIsVaccinated) petTags.push('Vaccinated');
                if (pet.petIsNeutered) petTags.push('Neutered');
                return (
                  <View key={pet.petId} style={styles.petRow}>
                    {pet.petProfilePhotoUrl ? (
                      <Image source={{ uri: pet.petProfilePhotoUrl }} style={styles.petAvatar} />
                    ) : (
                      <View style={styles.petAvatarFallback}>
                        <Text style={styles.petAvatarEmoji}>
                          {pet.petSpecies === 'CAT' ? '🐈' : '🐕'}
                        </Text>
                      </View>
                    )}
                    <View style={styles.petInfo}>
                      <Text style={styles.petName}>{pet.petName}</Text>
                      <Text style={styles.petMeta}>
                        {[pet.petBreed, pet.petAge, pet.petGender === 'FEMALE' ? 'Female' : pet.petGender === 'MALE' ? 'Male' : '']
                          .filter(Boolean).join(' · ')}
                      </Text>
                      {petTags.length > 0 && (
                        <View style={styles.tagsRow}>
                          {petTags.map(tag => (
                            <View key={tag} style={styles.tag}>
                              <Text style={styles.tagText}>
                                {tag === 'Vaccinated' ? '✅ ' : '✔ '}{tag}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}
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
            : <Text style={styles.ctaText}>{sent ? '✓  Request Sent' : 'Send Walk Request →'}</Text>}
        </TouchableOpacity>
      </View>

      {/* Custom result dialog */}
      <Modal visible={dialog.visible} transparent animationType="none" statusBarTranslucent>
        <View style={styles.overlay}>
          <Animated.View style={[styles.dialogCard, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
            {/* Icon */}
            <View style={[styles.dialogIcon, dialog.success ? styles.dialogIconSuccess : styles.dialogIconError]}>
              <Text style={styles.dialogIconText}>{dialog.success ? '🐾' : '⚠️'}</Text>
            </View>

            {/* Title */}
            <Text style={styles.dialogTitle}>
              {dialog.success ? 'Request Sent!' : 'Something went wrong'}
            </Text>

            {/* Message */}
            <Text style={styles.dialogMessage}>{dialog.message}</Text>

            {/* Owner chip — only on success */}
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

            {/* Button(s) */}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  hero: {
    backgroundColor: '#FDECEA',
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
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  heroAvatarText: { fontSize: 52, fontWeight: '700', color: '#FFFFFF' },
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
  availableDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  availableText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  contentCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 12,
    padding: 24,
    paddingBottom: 8,
  },
  ownerNameLarge: { fontSize: 26, fontWeight: '800', color: COLORS.text, marginBottom: 20 },
  petRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  petAvatar: { width: 56, height: 56, borderRadius: 28 },
  petAvatarFallback: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.primaryBorder,
  },
  petAvatarEmoji: { fontSize: 26 },
  petInfo: { flex: 1 },
  petName: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  petMeta: { fontSize: 13, color: COLORS.textSub, marginBottom: 6 },
  divider: { height: 1, backgroundColor: COLORS.border, marginBottom: 16 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  ownerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FDDDD5',
    alignItems: 'center', justifyContent: 'center',
  },
  ownerAvatarText: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  ownerName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
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
    backgroundColor: '#FFF8F5',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFE4D6',
  },
  invRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  invIcon: { fontSize: 16, width: 20 },
  invText: { fontSize: 14, color: COLORS.text, flex: 1 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  tag: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  tagText: { fontSize: 13, color: '#15803D', fontWeight: '500' },
  ctaWrap: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
  },
  ctaBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: COLORS.primary,
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
  dialogIconSuccess: { backgroundColor: '#FFF3E8', borderWidth: 2, borderColor: COLORS.primaryBorder },
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
    backgroundColor: COLORS.primary,
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
    backgroundColor: COLORS.primary,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: COLORS.primary,
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
