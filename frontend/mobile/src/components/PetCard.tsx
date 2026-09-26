import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { COLORS } from '../constants/colors';

interface PetCardProps {
  name: string;
  emoji: string;
  breed: string;
  age: string;
  distance: string;
  tags: string[];
  time?: string;
  owner?: string;
  rating?: number;
  online?: boolean;
  onConnect?: () => void;
  onHeart?: () => void;
  onMessage?: () => void;
  onPress?: () => void;
  variant?: 'connect' | 'heart';
  gender?: string;
  photoUrl?: string;
  connectStatus?: 'default' | 'requested' | 'rejected' | 'accepted';
  messageCount?: number;
}

export const PetCard: React.FC<PetCardProps> = ({
  name,
  emoji,
  breed,
  age,
  distance,
  tags,
  time,
  owner,
  rating,
  online = true,
  onConnect,
  onHeart,
  onMessage,
  onPress,
  variant = 'connect',
  gender,
  photoUrl,
  connectStatus = 'default',
  messageCount,
}) => {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.85}
    >
      {/* Unread message red dot — absolute top-right corner */}
      {messageCount != null && messageCount > 0 && (
        <TouchableOpacity style={styles.msgDot} onPress={onMessage} activeOpacity={0.75} />
      )}

      {/* Left: Avatar with status dot */}
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarEmoji}>{emoji}</Text>
          )}
        </View>
        <View style={[styles.statusDot, online ? styles.statusOnline : styles.statusOffline]} />
      </View>

      {/* Middle: Info */}
      <View style={styles.info}>
        <Text style={styles.nameLine} numberOfLines={1}>
          {breed && breed !== '—' ? `${name} · ${breed}` : name}
        </Text>
        <View style={styles.metaRow}>
          {owner && <Text style={styles.metaText}>👤 {owner}</Text>}
          <Text style={styles.metaText}>  📍 {distance}</Text>
        </View>
        {time && (
          <Text style={styles.metaText}>🕐 {time}</Text>
        )}
        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Right: Action button */}
      <View style={styles.actionWrap}>
        {variant === 'connect' ? (
          connectStatus === 'rejected' ? (
            <View style={styles.rejectedBtn}>
              <Text style={styles.rejectedBtnText}>✗ Rejected</Text>
            </View>
          ) : connectStatus === 'accepted' ? (
            <View style={styles.acceptedBtn}>
              <Text style={styles.acceptedBtnText}>✓ Accepted</Text>
            </View>
          ) : connectStatus === 'requested' ? (
            <View style={styles.requestedBtn}>
              <Text style={styles.requestedBtnText}>Requested ✓</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.connectBtn} onPress={onConnect}>
              <Text style={styles.connectBtnText}>Connect</Text>
            </TouchableOpacity>
          )
        ) : (
          connectStatus === 'rejected' ? (
            <View style={styles.rejectedBtn}>
              <Text style={styles.rejectedBtnText}>✗ Rejected</Text>
            </View>
          ) : connectStatus === 'accepted' ? (
            <View style={styles.acceptedBtn}>
              <Text style={styles.acceptedBtnText}>✓ Accepted</Text>
            </View>
          ) : connectStatus === 'requested' ? (
            <View style={styles.requestedBtn}>
              <Text style={styles.requestedBtnText}>Requested ✓</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.heartBtn} onPress={onHeart}>
              <Text style={styles.heartText}>💕</Text>
            </TouchableOpacity>
          )
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 12,
    flexShrink: 0,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 30,
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 14,
  },
  statusDot: {
    position: 'absolute',
    top: -3,
    left: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.card,
  },
  statusOnline: {
    backgroundColor: '#22C55E',
  },
  statusOffline: {
    backgroundColor: COLORS.textMuted,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  nameLine: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textSub,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  tag: {
    backgroundColor: COLORS.bg,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagText: {
    fontSize: 11,
    color: COLORS.textSub,
    fontWeight: '500',
  },
  actionWrap: {
    marginLeft: 10,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  connectBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  msgDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: COLORS.card,
    zIndex: 10,
  },
  rejectedBtn: {
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rejectedBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  acceptedBtn: {
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  acceptedBtnText: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '700',
  },
  requestedBtn: {
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  requestedBtnText: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '700',
  },
  heartBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartText: {
    fontSize: 18,
  },
});
