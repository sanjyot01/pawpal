import React, { useCallback, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';

interface ChatInputBarProps {
  onSend?: (message: string) => void;
  disabled?: boolean;
}

/**
 * The chat composer.
 *
 * The TextInput is deliberately **uncontrolled** (a ref plus defaultValue) rather
 * than driven by `value`. Both chat screens poll their thread every 4s and call
 * setMessages with a fresh array, which re-renders this component; re-rendering a
 * controlled TextInput on Android while the soft keyboard is holding a composing
 * region (any predictive-text keyboard, mid-word) discards that composition, so
 * the message that actually got sent was a fragment of what was typed -- often a
 * single letter. Keeping the value in native means a parent re-render cannot
 * touch what is being typed.
 *
 * memo() closes the same hole from the other side: with a stable `onSend` this
 * does not re-render on a poll at all.
 */
const ChatInputBarComponent: React.FC<ChatInputBarProps> = ({ onSend, disabled }) => {
  const inputRef = useRef<TextInput>(null);
  // Source of truth for what is typed. State would re-render on every keystroke
  // and put us back where we started.
  const draft = useRef('');
  // Only drives the send button's enabled look, never the input's contents.
  const [canSend, setCanSend] = useState(false);
  const insets = useSafeAreaInsets();

  const handleChangeText = useCallback((next: string) => {
    draft.current = next;
    const nowCanSend = next.trim().length > 0;
    // Flip only on the empty/non-empty boundary, not per character.
    setCanSend(prev => (prev === nowCanSend ? prev : nowCanSend));
  }, []);

  const handleSend = useCallback(() => {
    const text = draft.current.trim();
    if (!text || disabled) return;
    onSend?.(text);
    draft.current = '';
    inputRef.current?.clear();
    setCanSend(false);
  }, [onSend, disabled]);

  if (disabled) {
    return (
      <View style={[styles.disabledContainer, { paddingBottom: insets.bottom + 8 }]}>
        <Text style={styles.disabledText}>🔒 Conversation closed</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 8 }]}>
      <TouchableOpacity style={styles.emojiButton}>
        <Text style={styles.emojiButtonText}>😊</Text>
      </TouchableOpacity>
      <TextInput
        ref={inputRef}
        style={styles.input}
        defaultValue=""
        onChangeText={handleChangeText}
        placeholder="Type a message..."
        placeholderTextColor={COLORS.textMuted}
        multiline
        maxLength={500}
      />
      <TouchableOpacity
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={!canSend}
      >
        <Text style={styles.sendIcon}>▶</Text>
      </TouchableOpacity>
    </View>
  );
};

export const ChatInputBar = React.memo(ChatInputBarComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  emojiButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0EDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiButtonText: {
    fontSize: 20,
  },
  input: {
    flex: 1,
    backgroundColor: '#F0EDF5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    color: COLORS.text,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.textMuted,
    shadowOpacity: 0,
  },
  sendIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  disabledText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
});
