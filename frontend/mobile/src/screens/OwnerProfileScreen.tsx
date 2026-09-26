import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';

interface OwnerProfileScreenProps {
  navigation: any;
}

export const OwnerProfileScreen: React.FC<OwnerProfileScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Owner Profile</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Owner Strip */}
      <View style={styles.ownerStrip}>
        <View style={styles.ownerAvatar}>
          <Text style={styles.ownerAvatarText}>👩</Text>
        </View>
        <View style={styles.ownerDetails}>
          <Text style={styles.ownerName}>Luna's Owner</Text>
          <Text style={styles.ownerMeta}>📍 0.4 km away</Text>
          <Text style={styles.ownerRating}>⭐ 4.7 · 9 reviews</Text>
        </View>
        <TouchableOpacity style={styles.messageBtn}>
          <Text style={styles.messageBtnText}>💬 Message</Text>
        </TouchableOpacity>
      </View>

      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>🐾 Pet Profile</Text>
      </View>

      {/* Pet Card */}
      <View style={styles.petCard}>
        {/* Pet Avatar with check badge */}
        <View style={styles.petAvatarSection}>
          <View style={styles.petAvatarWrap}>
            <View style={styles.petAvatar}>
              <Text style={styles.petAvatarEmoji}>🐱</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedBadgeText}>✅</Text>
            </View>
          </View>
          <View style={styles.petBasicInfo}>
            <Text style={styles.petName}>Luna</Text>
            <Text style={styles.petBreedLine}>Persian Cat · 2y · ♀ Female</Text>
            <View style={styles.distanceBadge}>
              <Text style={styles.distanceBadgeText}>0.4 km away</Text>
            </View>
          </View>
        </View>

        {/* Tags */}
        <View style={styles.tagsWrap}>
          {['Calm', 'Indoor', 'Vaccinated', 'Gentle'].map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {/* Bio */}
        <View style={styles.bioSection}>
          <Text style={styles.bioTitle}>About Luna</Text>
          <Text style={styles.bioText}>
            Luna is a graceful Persian cat who loves cozy corners, gentle belly rubs, and watching
            birds from the window. She's wonderfully socialized and enjoys meeting other calm pets.
            Looking for a gentle companion to share a park afternoon with. 🌸
          </Text>
        </View>

        {/* Health Info */}
        <View style={styles.healthRow}>
          <View style={styles.healthItem}>
            <Text style={styles.healthIcon}>💉</Text>
            <Text style={styles.healthLabel}>Vaccinated</Text>
            <Text style={styles.healthValue}>Yes</Text>
          </View>
          <View style={styles.healthDivider} />
          <View style={styles.healthItem}>
            <Text style={styles.healthIcon}>✂️</Text>
            <Text style={styles.healthLabel}>Spayed</Text>
            <Text style={styles.healthValue}>Yes</Text>
          </View>
          <View style={styles.healthDivider} />
          <View style={styles.healthItem}>
            <Text style={styles.healthIcon}>🏥</Text>
            <Text style={styles.healthLabel}>Last Checkup</Text>
            <Text style={styles.healthValue}>Jan 2026</Text>
          </View>
        </View>
      </View>

      {/* CTA */}
      <View style={styles.ctaRow}>
        <TouchableOpacity style={styles.acceptBtn}>
          <Text style={styles.acceptBtnText}>💕 Accept Date Request</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {},
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
  ownerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  ownerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatarText: {
    fontSize: 26,
  },
  ownerDetails: {
    flex: 1,
    gap: 2,
  },
  ownerName: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  ownerMeta: {
    fontSize: 13,
    color: COLORS.textSub,
  },
  ownerRating: {
    fontSize: 13,
    color: COLORS.textSub,
  },
  messageBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 100,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  messageBtnText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '700',
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  petCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 18,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    gap: 16,
  },
  petAvatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  petAvatarWrap: {
    position: 'relative',
  },
  petAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#DDD6FE',
  },
  petAvatarEmoji: {
    fontSize: 42,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  verifiedBadgeText: {
    fontSize: 14,
  },
  petBasicInfo: {
    flex: 1,
    gap: 4,
  },
  petName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  petBreedLine: {
    fontSize: 14,
    color: COLORS.textSub,
  },
  distanceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 100,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  distanceBadgeText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: COLORS.purpleLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  tagText: {
    fontSize: 13,
    color: COLORS.purple,
    fontWeight: '500',
  },
  bioSection: {
    gap: 6,
  },
  bioTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  bioText: {
    fontSize: 14,
    color: COLORS.textSub,
    lineHeight: 22,
  },
  healthRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    padding: 14,
  },
  healthItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  healthDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },
  healthIcon: {
    fontSize: 18,
  },
  healthLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  healthValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  ctaRow: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  acceptBtn: {
    backgroundColor: COLORS.purple,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
});
