import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS } from '../constants/colors';
import { BreedPicker } from '../components/BreedPicker';
import { apiPost } from '../utils/api';
import { uploadImage } from '../utils/uploadImage';

type Species = 'DOG' | 'CAT' | 'OTHER';
type Gender  = 'MALE' | 'FEMALE';

function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function computeAgeLabel(dob: Date): string {
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  if (now.getDate() < dob.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years <= 0) return `${months} month${months === 1 ? '' : 's'} old`;
  return `${years} year${years === 1 ? '' : 's'} old`;
}

interface Props { navigation: any; }

export const AddPetScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const [species, setSpeciesRaw]      = useState<Species>('DOG');
  const [name, setName]               = useState('');
  const [breed, setBreed]             = useState('');
  const [gender, setGender]           = useState<Gender>('MALE');
  const [dob, setDob]                 = useState<Date | null>(null);
  const [dobPickerVisible, setDobPickerVisible] = useState(false);

  // Switching species invalidates the selected breed
  const setSpecies = (s: Species) => {
    if (s !== species) setBreed('');
    setSpeciesRaw(s);
  };
  const [bio, setBio]                 = useState('');
  const [isVaccinated, setIsVaccinated] = useState<boolean | null>(null);
  const [isNeutered, setIsNeutered]   = useState<boolean | null>(null);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (!name.trim()) { Alert.alert('Validation', 'Pet name is required'); return; }
    if (isVaccinated === null || isNeutered === null) {
      Alert.alert(
        'Health info required',
        'Please let us know whether your pet is vaccinated and neutered/spayed — this keeps other pets safe on walks and dates.'
      );
      return;
    }
    try {
      setSaving(true);
      let profilePhotoUrl: string | undefined;
      if (photoUri) {
        profilePhotoUrl = await uploadImage(photoUri, 'pets');
      }
      await apiPost('/api/pets', {
        name: name.trim(),
        species,
        breed: breed.trim() || undefined,
        gender,
        ...(dob ? { dateOfBirth: toIsoDate(dob) } : {}),
        bio: bio.trim() || undefined,
        isVaccinated,
        isNeutered,
        ...(profilePhotoUrl ? { profilePhotoUrl } : {}),
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add pet');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <DateTimePickerModal
        isVisible={dobPickerVisible}
        mode="date"
        maximumDate={new Date()}
        date={dob ?? new Date()}
        onConfirm={(d) => { setDob(d); setDobPickerVisible(false); }}
        onCancel={() => setDobPickerVisible(false)}
        display={Platform.OS === 'ios' ? 'inline' : 'default'}
        accentColor={COLORS.primary}
      />
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Pet</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Photo */}
        <View style={styles.photoSection}>
          <TouchableOpacity style={styles.photoCircle} onPress={pickPhoto}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoImage} />
            ) : (
              <>
                <Text style={styles.photoEmoji}>🐾</Text>
                <View style={styles.cameraBadge}>
                  <Text style={styles.cameraIcon}>📷</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={pickPhoto}>
            <Text style={styles.uploadLabel}>{photoUri ? 'Change Photo' : 'Upload Pet Photo'}</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.formCard}>
          {/* Species */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Species</Text>
            <View style={styles.toggleRow}>
              {(['DOG', 'CAT', 'OTHER'] as Species[]).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.toggleOpt, species === s && styles.toggleOptActive]}
                  onPress={() => setSpecies(s)}
                >
                  <Text style={[styles.toggleText, species === s && styles.toggleTextActive]}>
                    {s === 'DOG' ? '🐕  Dog' : s === 'CAT' ? '🐈  Cat' : '🐾  Other'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Name */}
          <View style={[styles.fieldGroup, styles.fieldBorder]}>
            <Text style={styles.fieldLabel}>Pet Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="e.g. Buddy" placeholderTextColor={COLORS.textMuted} returnKeyType="next" />
          </View>

          {/* Breed */}
          <View style={[styles.fieldGroup, styles.fieldBorder]}>
            <Text style={styles.fieldLabel}>Breed</Text>
            {species === 'OTHER' ? (
              <TextInput
                style={styles.input}
                value={breed}
                onChangeText={setBreed}
                placeholder="e.g. Rabbit, Parrot, Hamster..."
                placeholderTextColor={COLORS.textMuted}
              />
            ) : (
              <BreedPicker species={species} value={breed} onChange={setBreed} />
            )}
          </View>

          {/* Birthday / Age */}
          <View style={[styles.fieldGroup, styles.fieldBorder]}>
            <Text style={styles.fieldLabel}>Birthday{dob ? `  ·  ${computeAgeLabel(dob)}` : ''}</Text>
            <TouchableOpacity style={styles.dobInput} onPress={() => setDobPickerVisible(true)} activeOpacity={0.7}>
              <Text style={dob ? styles.dobText : styles.dobPlaceholder}>
                {dob
                  ? dob.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                  : 'Select birthday'}
              </Text>
              <Text style={styles.dobIcon}>🎂</Text>
            </TouchableOpacity>
          </View>

          {/* Gender */}
          <View style={[styles.fieldGroup, styles.fieldBorder]}>
            <Text style={styles.fieldLabel}>Gender</Text>
            <View style={styles.toggleRow}>
              {(['MALE', 'FEMALE'] as Gender[]).map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.toggleOpt, gender === g && styles.toggleOptActive]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[styles.toggleText, gender === g && styles.toggleTextActive]}>
                    {g === 'MALE' ? '♂  Male' : '♀  Female'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Bio */}
          <View style={[styles.fieldGroup, styles.fieldBorder]}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={bio} onChangeText={setBio}
              placeholder="Describe your pet's personality…"
              placeholderTextColor={COLORS.textMuted}
              multiline numberOfLines={3} textAlignVertical="top"
            />
          </View>

          {/* Health */}
          <View style={[styles.fieldGroup, styles.fieldBorder]}>
            <Text style={styles.fieldLabel}>Vaccinated *</Text>
            <View style={styles.toggleRow}>
              {([true, false] as const).map(v => (
                <TouchableOpacity
                  key={String(v)}
                  style={[styles.toggleOpt, isVaccinated === v && styles.toggleOptActive]}
                  onPress={() => setIsVaccinated(v)}
                >
                  <Text style={[styles.toggleText, isVaccinated === v && styles.toggleTextActive]}>
                    {v ? 'Yes' : 'No'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.fieldGroup, styles.fieldBorder]}>
            <Text style={styles.fieldLabel}>Neutered / Spayed *</Text>
            <View style={styles.toggleRow}>
              {([true, false] as const).map(v => (
                <TouchableOpacity
                  key={String(v)}
                  style={[styles.toggleOpt, isNeutered === v && styles.toggleOptActive]}
                  onPress={() => setIsNeutered(v)}
                >
                  <Text style={[styles.toggleText, isNeutered === v && styles.toggleTextActive]}>
                    {v ? 'Yes' : 'No'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, saving && styles.disabled]}
          onPress={handleSubmit} disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.primaryBtnText}>Add Pet 🐾</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    paddingHorizontal: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 22, color: COLORS.text },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: COLORS.text },
  scroll: { paddingHorizontal: 16, paddingTop: 24 },
  photoSection: { alignItems: 'center', marginBottom: 28 },
  photoCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.primaryBorder,
    overflow: 'visible',
  },
  photoImage: { width: 100, height: 100, borderRadius: 50 },
  photoEmoji: { fontSize: 40 },
  cameraBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.card,
  },
  cameraIcon: { fontSize: 13 },
  uploadLabel: { marginTop: 12, fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  formCard: {
    backgroundColor: COLORS.card, borderRadius: 20,
    paddingHorizontal: 20, marginBottom: 20,
    shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1, shadowRadius: 8, elevation: 3,
  },
  fieldGroup: { paddingVertical: 16 },
  fieldBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: COLORS.textMuted,
    marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.bg, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
  },
  inputMultiline: { height: 80, paddingTop: 12 },
  dobInput: {
    backgroundColor: COLORS.bg, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: COLORS.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dobText: { fontSize: 15, color: COLORS.text, flex: 1 },
  dobPlaceholder: { fontSize: 15, color: COLORS.textMuted, flex: 1 },
  dobIcon: { fontSize: 16, marginLeft: 8 },
  toggleRow: {
    flexDirection: 'row', backgroundColor: COLORS.bg,
    borderRadius: 12, padding: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  toggleOpt: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  toggleOptActive: {
    backgroundColor: COLORS.card,
    shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  toggleText: { fontSize: 14, fontWeight: '400', color: COLORS.textMuted },
  toggleTextActive: { fontWeight: '700', color: COLORS.text },
  primaryBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
