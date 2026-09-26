import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';

/**
 * Shown when a screen's data failed to load.
 *
 * These screens used to swallow the error and render their empty state, so a
 * backend that was down looked exactly like "no walks near you" — nothing to
 * read, nothing to retry, and no reason to think anything was wrong. The retry
 * matters as much as the message: the most common cause is transient.
 */
export const ErrorNotice: React.FC<{
  message: string;
  onRetry?: () => void;
  /** Inline inside a list/sheet rather than a full-width page banner. */
  compact?: boolean;
}> = ({ message, onRetry, compact }) => (
  <View style={[styles.box, compact && styles.boxCompact]}>
    <Text style={styles.message}>{message}</Text>
    {onRetry ? (
      <TouchableOpacity onPress={onRetry} style={styles.retryBtn} activeOpacity={0.8}>
        <Text style={styles.retryText}>Try again</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    alignItems: 'center',
  },
  boxCompact: { marginHorizontal: 0, marginVertical: 8, paddingVertical: 12 },
  message: { fontSize: 13, color: '#B91C1C', textAlign: 'center', lineHeight: 18 },
  retryBtn: {
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  retryText: { fontSize: 13, fontWeight: '700', color: '#B91C1C' },
});
