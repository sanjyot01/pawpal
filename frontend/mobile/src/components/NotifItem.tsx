import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { COLORS } from '../constants/colors';
import { Notification } from '../constants/mockData';

interface NotifItemProps {
  item: Notification;
  onPress?: () => void;
}

export const NotifItem: React.FC<NotifItemProps> = ({ item, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.container, item.isNew && styles.containerNew]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.badgeWrap}>
        <View style={styles.badge}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.badgeInitial}>
              {item.senderName?.[0]?.toUpperCase() ?? '?'}
            </Text>
          )}
        </View>
        <View style={styles.petBadge}>
          <Text style={styles.petEmoji}>{item.petEmoji}</Text>
        </View>
      </View>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.senderName}>{item.senderName}</Text>
          <Text style={styles.time}>{item.time}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={2}>
          {item.preview}
        </Text>
        <View style={styles.footerRow}>
          <View style={styles.categoryChip}>
            <Text style={styles.categoryText}>{item.categoryLabel}</Text>
          </View>
          {item.isNew && <View style={styles.unreadDot} />}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 5,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  containerNew: {
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
  },
  badgeWrap: {
    width: 48,
    height: 48,
    marginRight: 12,
    position: 'relative',
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badgeEmoji: {
    fontSize: 20,
  },
  badgeInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },
  avatarImage: {
    width: 44,
    height: 44,
  },
  petBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.card,
  },
  petEmoji: {
    fontSize: 10,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  senderName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  time: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  preview: {
    fontSize: 13,
    color: COLORS.textSub,
    lineHeight: 18,
    marginBottom: 6,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryChip: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  categoryText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
});
