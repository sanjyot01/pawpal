import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { COLORS } from '../constants/colors';

interface FilterRowProps {
  label: string;
  options: string[];
  active: string;
  onSelect: (option: string) => void;
  accentColor?: string;
}

export const FilterRow: React.FC<FilterRowProps> = ({
  label,
  options,
  active,
  onSelect,
  accentColor = COLORS.primary,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        style={styles.scrollView}
      >
        {options.map((option) => {
          const isActive = option === active;
          return (
            <TouchableOpacity
              key={option}
              onPress={() => onSelect(option)}
              style={[
                styles.chip,
                isActive
                  ? { backgroundColor: accentColor, borderColor: accentColor }
                  : styles.chipInactive,
              ]}
            >
              <Text style={[styles.chipText, isActive ? styles.chipTextActive : styles.chipTextInactive]}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSub,
    marginRight: 10,
    flexShrink: 0,
    width: 44,
  },
  scrollView: {
    flex: 1,
  },
  scroll: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipInactive: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  chipTextInactive: {
    color: COLORS.textSub,
  },
});
