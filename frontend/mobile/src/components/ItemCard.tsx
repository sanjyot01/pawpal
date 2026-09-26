import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { COLORS } from '../constants/colors';
import { MarketItem, categoryEmoji, conditionLabel } from '../constants/market';

interface ItemCardProps {
  item: MarketItem;
  onPress?: () => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onPress }) => {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageContainer}>
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.itemPhoto} />
        ) : (
          <Text style={styles.itemEmoji}>{categoryEmoji(item.category)}</Text>
        )}
        {(item.unreadMessageCount ?? 0) > 0 && <View style={styles.msgDot} />}
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>${item.price ?? 0}</Text>
          {item.originalPrice != null && (
            <Text style={styles.originalPrice}>${item.originalPrice}</Text>
          )}
        </View>
        {item.location ? (
          <Text style={styles.location} numberOfLines={1}>📍 {item.location}</Text>
        ) : null}
        <View style={styles.footer}>
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionText}>{conditionLabel(item.condition)}</Text>
          </View>
          <View style={styles.sellerRow}>
            {item.sellerAvatarUrl ? (
              <Image source={{ uri: item.sellerAvatarUrl }} style={styles.sellerAvatar} />
            ) : (
              <Text style={styles.sellerEmoji}>👤</Text>
            )}
            <Text style={styles.sellerName} numberOfLines={1}>{item.sellerName ?? ''}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    flex: 1,
    margin: 6,
    maxWidth: '48%',
  },
  imageContainer: {
    height: 110,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemPhoto: {
    width: '100%',
    height: '100%',
  },
  itemEmoji: {
    fontSize: 50,
  },
  msgDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: COLORS.card,
  },
  content: {
    padding: 12,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  price: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  originalPrice: {
    fontSize: 12,
    color: COLORS.textMuted,
    textDecorationLine: 'line-through',
  },
  location: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  conditionBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  conditionText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
  },
  sellerAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  sellerEmoji: {
    fontSize: 12,
  },
  sellerName: {
    fontSize: 11,
    color: COLORS.textMuted,
    flexShrink: 1,
  },
});
