import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { COLORS } from '../constants/colors';

export const DOG_BREEDS = [
  'Golden Retriever',
  'Labrador Retriever',
  'Poodle',
  'Corgi',
  'Shiba Inu',
  'Husky',
  'German Shepherd',
  'Border Collie',
  'Bulldog',
  'Beagle',
  'Chihuahua',
  'Pomeranian',
  'Samoyed',
  'Dachshund',
  'Mixed / Other',
];

export const CAT_BREEDS = [
  'Persian',
  'British Shorthair',
  'Maine Coon',
  'Ragdoll',
  'Siamese',
  'American Shorthair',
  'Scottish Fold',
  'Sphynx',
  'Bengal',
  'Russian Blue',
  'Munchkin',
  'Mixed / Other',
];

interface BreedPickerProps {
  species: 'DOG' | 'CAT';
  value: string;
  onChange: (breed: string) => void;
}

export const BreedPicker: React.FC<BreedPickerProps> = ({ species, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const breeds = species === 'CAT' ? CAT_BREEDS : DOG_BREEDS;

  return (
    <>
      <TouchableOpacity style={styles.selectInput} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={value ? styles.selectText : styles.selectPlaceholder}>
          {value || 'Select breed'}
        </Text>
        <Text style={styles.selectArrow}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {species === 'CAT' ? '🐈 Cat Breeds' : '🐕 Dog Breeds'}
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={breeds}
              keyExtractor={(b) => b}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const selected = item === value;
                return (
                  <TouchableOpacity
                    style={[styles.option, selected && styles.optionActive]}
                    onPress={() => { onChange(item); setOpen(false); }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextActive]}>
                      {item}
                    </Text>
                    {selected && <Text style={styles.optionCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  selectInput: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectText: { fontSize: 15, color: COLORS.text, flex: 1 },
  selectPlaceholder: { fontSize: 15, color: COLORS.textMuted, flex: 1 },
  selectArrow: { fontSize: 16, color: COLORS.textMuted, marginLeft: 8 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '65%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: 14, color: COLORS.textSub },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optionActive: { backgroundColor: COLORS.primaryLight },
  optionText: { fontSize: 15, color: COLORS.text },
  optionTextActive: { fontWeight: '700', color: COLORS.primary },
  optionCheck: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
});
