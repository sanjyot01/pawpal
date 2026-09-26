import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { COLORS } from '../constants/colors';

interface ChatBubbleProps {
  message: string;
  timestamp: string;
  isOwn: boolean;
  avatarEmoji?: string;
  avatarUrl?: string;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  timestamp,
  isOwn,
  avatarEmoji = '👤',
  avatarUrl,
}) => {
  if (isOwn) {
    return (
      <View style={styles.ownRow}>
        <View style={styles.ownBubble}>
          <Text style={styles.ownText}>{message}</Text>
        </View>
        <Text style={styles.timestamp}>{timestamp}</Text>
      </View>
    );
  }

  return (
    <View style={styles.otherRow}>
      <View style={styles.avatar}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
        ) : (
          <Text style={styles.avatarText}>{avatarEmoji}</Text>
        )}
      </View>
      <View style={styles.otherContent}>
        <View style={styles.otherBubble}>
          <Text style={styles.otherText}>{message}</Text>
        </View>
        <Text style={styles.timestamp}>{timestamp}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  ownRow: {
    alignItems: 'flex-end',
    marginVertical: 6,
    paddingHorizontal: 16,
  },
  ownBubble: {
    backgroundColor: COLORS.primary,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '75%',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  ownText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 6,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontSize: 16,
  },
  avatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  otherContent: {
    alignItems: 'flex-start',
  },
  otherBubble: {
    backgroundColor: '#F0EDF5',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '75%',
  },
  otherText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
});
