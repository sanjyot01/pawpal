import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { COLORS } from '../constants/colors';
import { apiGet, apiPut } from '../utils/api';
import { uploadImage } from '../utils/uploadImage';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  bio?: string;
  location?: string;
  avatarUrl?: string;
}

interface Props { navigation: any; }

export const EditProfileScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);   // local URI (just picked)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);   // existing remote URL

  useEffect(() => {
    apiGet<UserProfile>('/api/users/me')
      .then(p => {
        setName(p.name ?? '');
        setBio(p.bio ?? '');
        setLocation(p.location ?? '');
        setAvatarUrl(p.avatarUrl ?? null);
      })
      .catch(() => Alert.alert('Error', 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  // ── Image picker ───────────────────────────────────────────────────
  const pickAvatar = async () => {
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
    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  // ── Auto-locate ────────────────────────────────────────────────────
  const autoLocate = async () => {
    try {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow location access in Settings.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [addr] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const city = addr.city || addr.subregion || '';
      const region = addr.region || '';
      const country = addr.country || '';
      setLocation([city, region, country].filter(Boolean).join(', '));
    } catch {
      Alert.alert('Error', 'Could not detect location. Please enter manually.');
    } finally {
      setLocating(false);
    }
  };

  // ── Save ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    try {
      setSaving(true);
      let finalAvatarUrl = avatarUrl;
      if (avatarUri) {
        finalAvatarUrl = await uploadImage(avatarUri, 'avatars');
      }
      await apiPut('/api/users/me', {
        name: name.trim(),
        bio: bio.trim(),
        location: location.trim(),
        ...(finalAvatarUrl ? { avatarUrl: finalAvatarUrl } : {}),
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const avatarSource = avatarUri ?? avatarUrl;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarCircle} onPress={pickAvatar}>
            {avatarSource ? (
              <Image source={{ uri: avatarSource }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarEmoji}>👤</Text>
            )}
            <View style={styles.cameraBadge}>
              <Text style={styles.cameraIcon}>📷</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickAvatar}>
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.formCard}>
          {/* Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="next"
            />
          </View>

          {/* Bio */}
          <View style={[styles.fieldGroup, styles.fieldBorder]}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell the community about yourself…"
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Location */}
          <View style={[styles.fieldGroup, styles.fieldBorder]}>
            <Text style={styles.fieldLabel}>Location</Text>
            <View style={styles.locationRow}>
              <TextInput
                style={[styles.input, styles.locationInput]}
                value={location}
                onChangeText={setLocation}
                placeholder="City, Country"
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={styles.locateBtn}
                onPress={autoLocate}
                disabled={locating}
              >
                {locating
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Text style={styles.locateIcon}>📍</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, saving && styles.disabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.primaryBtnText}>Save Changes</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 22, color: COLORS.text },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: COLORS.text },
  saveBtn: { width: 60, alignItems: 'flex-end', paddingRight: 8 },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  scroll: { paddingHorizontal: 16, paddingTop: 24 },
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatarCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.primaryBorder,
    overflow: 'visible',
  },
  avatarImage: { width: 90, height: 90, borderRadius: 45 },
  avatarEmoji: { fontSize: 42 },
  cameraBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.card,
  },
  cameraIcon: { fontSize: 13 },
  changePhotoText: { marginTop: 12, fontSize: 13, color: COLORS.primary, fontWeight: '600' },
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
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.bg, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
  },
  inputMultiline: { height: 80, paddingTop: 12 },
  locationRow: { flexDirection: 'row', gap: 8 },
  locationInput: { flex: 1 },
  locateBtn: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.primaryBorder,
  },
  locateIcon: { fontSize: 22 },
  primaryBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
