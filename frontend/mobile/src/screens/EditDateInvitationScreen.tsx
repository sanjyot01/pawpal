import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  Modal,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../constants/colors';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiPut, apiDelete, apiGet, errorMessage } from '../utils/api';
import { uploadImage } from '../utils/uploadImage';
import { ImageViewerModal } from '../components/ImageViewerModal';

const MAX_PHOTOS = 5;

interface Pet {
  id: string;
  name: string;
  species: string;
  breed?: string;
  profilePhotoUrl?: string;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface EditDateInvitationScreenProps {
  navigation: any;
  route: any;
}

export const EditDateInvitationScreen: React.FC<EditDateInvitationScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const invitation = route?.params?.invitation;

  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(invitation?.hostPetId ?? null);
  const [location, setLocation] = useState(invitation?.location || '');
  const [locationCoords, setLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [message, setMessage] = useState(invitation?.message || '');
  const [saving, setSaving] = useState(false);
  const [petsError, setPetsError] = useState<string>();
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [images, setImages] = useState<string[]>(invitation?.imageUrls ?? []);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (confirmVisible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
    }
  }, [confirmVisible]);

  const dateLabel = selectedDate ? formatDate(selectedDate) : (invitation?.date || 'Select date');
  const timeLabel = selectedTime ? formatTime(selectedTime) : (invitation?.time || 'Select time');

  const loadPets = useCallback(() => {
    setPetsError(undefined);
    apiGet<Pet[]>('/api/pets/my')
      .then(setPets)
      // Silently empty, the pet selector vanished and the edit form looked as
      // though the invitation had no pet attached.
      .catch(e => setPetsError(errorMessage(e, 'Could not load your pets.')));
  }, []);

  useEffect(() => { loadPets(); }, [loadPets]);

  const useCurrentLocation = async () => {
    try {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location permission is required to use your current location.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocationCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      const places = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      const p = places[0];
      const label = p
        ? [p.name, p.street, p.city].filter(Boolean).join(', ')
        : `${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`;
      setLocation(label);
    } catch (_) {
      Alert.alert('Error', 'Could not get your current location.');
    } finally {
      setLocating(false);
    }
  };

  const pickImages = async () => {
    const remaining = MAX_PHOTOS - images.length;
    if (remaining <= 0) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (!result.canceled) {
      setImages(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, MAX_PHOTOS));
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerVisible(true);
  };

  const handleSave = async () => {
    if (!selectedPetId) { Alert.alert('Validation', 'Please select the pet going on the date.'); return; }
    if (!location.trim()) { Alert.alert('Validation', 'Please set a meeting location.'); return; }
    try {
      setSaving(true);
      const imageUrls = await Promise.all(
        images.map(uri => (uri.startsWith('http') ? uri : uploadImage(uri, 'dates')))
      );
      await apiPut(`/api/date/invitations/${invitation.id}`, {
        hostPetId: selectedPetId,
        location: location.trim(),
        ...(locationCoords ? { latitude: locationCoords.latitude, longitude: locationCoords.longitude } : {}),
        date: selectedDate ? formatDate(selectedDate) : (invitation?.date || ''),
        time: selectedTime ? formatTime(selectedTime) : (invitation?.time || ''),
        message: message.trim() || undefined,
        imageUrls,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const confirmWithdraw = async () => {
    setConfirmVisible(false);
    try {
      setWithdrawing(true);
      await apiDelete(`/api/date/invitations/${invitation.id}`);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to withdraw');
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <View style={styles.container}>
      <DateTimePickerModal
        isVisible={datePickerVisible}
        mode="date"
        minimumDate={new Date()}
        onConfirm={(d) => { setSelectedDate(d); setDatePickerVisible(false); }}
        onCancel={() => setDatePickerVisible(false)}
        display={Platform.OS === 'ios' ? 'inline' : 'default'}
        accentColor={COLORS.purple}
      />
      <DateTimePickerModal
        isVisible={timePickerVisible}
        mode="time"
        onConfirm={(d) => { setSelectedTime(d); setTimePickerVisible(false); }}
        onCancel={() => setTimePickerVisible(false)}
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        accentColor={COLORS.purple}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={[styles.headerBar, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Date</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.formBody}>
          {/* Pet selector — single choice */}
          {petsError ? <ErrorNotice message={petsError} onRetry={loadPets} compact /> : null}
          {pets.length > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>💕 Pet Going on the Date</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.petScrollContent}
              >
                {pets.map(pet => {
                  const selected = selectedPetId === pet.id;
                  return (
                    <TouchableOpacity
                      key={pet.id}
                      style={[styles.petChip, selected && styles.petChipActive]}
                      onPress={() => setSelectedPetId(pet.id)}
                      activeOpacity={0.8}
                    >
                      {pet.profilePhotoUrl ? (
                        <Image source={{ uri: pet.profilePhotoUrl }} style={styles.petChipPhoto} />
                      ) : (
                        <View style={[styles.petChipEmoji, selected && styles.petChipEmojiActive]}>
                          <Text style={styles.petChipEmojiText}>
                            {pet.species === 'CAT' ? '🐈' : '🐕'}
                          </Text>
                        </View>
                      )}
                      <View style={styles.petChipInfo}>
                        <Text style={[styles.petChipName, selected && styles.petChipNameActive]} numberOfLines={1}>
                          {pet.name}
                        </Text>
                        {pet.breed ? (
                          <Text style={styles.petChipBreed} numberOfLines={1}>{pet.breed}</Text>
                        ) : null}
                      </View>
                      {selected && <Text style={styles.petChipCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Location */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>📍 Meeting Location</Text>
            <View style={styles.locationRow}>
              <TextInput
                style={[styles.input, styles.locationInput]}
                value={location}
                onChangeText={(text) => { setLocation(text); setLocationCoords(null); }}
                placeholder="e.g. Central Park dog run"
                placeholderTextColor={COLORS.textMuted}
              />
              <TouchableOpacity
                style={styles.locateBtn}
                onPress={useCurrentLocation}
                disabled={locating}
                activeOpacity={0.7}
              >
                {locating
                  ? <ActivityIndicator size="small" color={COLORS.purple} />
                  : <Text style={styles.locateIcon}>📍</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {/* Date */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>📅 Date</Text>
            <TouchableOpacity style={styles.selectInput} onPress={() => setDatePickerVisible(true)}>
              <Text style={styles.selectText}>{dateLabel}</Text>
              <Text style={styles.selectArrow}>📅</Text>
            </TouchableOpacity>
          </View>

          {/* Time */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>🕐 Time</Text>
            <TouchableOpacity style={styles.selectInput} onPress={() => setTimePickerVisible(true)}>
              <Text style={styles.selectText}>{timeLabel}</Text>
              <Text style={styles.selectArrow}>🕐</Text>
            </TouchableOpacity>
          </View>

          {/* Photos */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>📸 Photos (optional, up to {MAX_PHOTOS})</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoScrollContent}
            >
              {images.map((uri, i) => (
                <View key={uri + i} style={styles.photoThumbWrap}>
                  <TouchableOpacity onPress={() => openViewer(i)} activeOpacity={0.85}>
                    <Image source={{ uri }} style={styles.photoThumb} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removeImage(i)} hitSlop={8}>
                    <Text style={styles.photoRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {images.length < MAX_PHOTOS && (
                <TouchableOpacity style={styles.addPhotoTile} onPress={pickImages} activeOpacity={0.8}>
                  <Text style={styles.addPhotoIcon}>+</Text>
                  <Text style={styles.addPhotoText}>Add Photo</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          {/* Message */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>💬 Message (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              placeholder="Tell others about your pet and what you're looking for..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Withdraw */}
          <TouchableOpacity
            style={[styles.withdrawBtn, withdrawing && { opacity: 0.6 }]}
            onPress={() => setConfirmVisible(true)}
            disabled={withdrawing}
          >
            {withdrawing
              ? <ActivityIndicator color="#EF4444" />
              : <Text style={styles.withdrawText}>🗑 Withdraw Invitation</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={[styles.ctaContainer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={[styles.ctaButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.ctaText}>💾 Save Changes</Text>}
        </TouchableOpacity>
      </View>

      <ImageViewerModal
        visible={viewerVisible}
        images={images}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      {/* Withdraw confirmation dialog */}
      <Modal visible={confirmVisible} transparent animationType="none" statusBarTranslucent>
        <View style={styles.overlay}>
          <Animated.View style={[styles.dialogCard, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
            <View style={styles.dialogIcon}>
              <Text style={styles.dialogIconText}>🗑</Text>
            </View>
            <Text style={styles.dialogTitle}>Withdraw this date?</Text>
            <Text style={styles.dialogMessage}>
              Your date invitation{invitation?.petName ? ` for ${invitation.petName}` : ''} will be removed
              and others will no longer see it. This action cannot be undone.
            </Text>
            {(invitation?.location || invitation?.date) ? (
              <View style={styles.dialogInfoChip}>
                {invitation?.location ? (
                  <Text style={styles.dialogInfoText} numberOfLines={1}>📍 {invitation.location}</Text>
                ) : null}
                {invitation?.date ? (
                  <Text style={styles.dialogInfoText}>🗓 {invitation.date}{invitation?.time ? ` · ${invitation.time}` : ''}</Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.dialogBtnSecondary} onPress={() => setConfirmVisible(false)}>
                <Text style={styles.dialogBtnSecondaryText}>Keep It</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogBtnDanger} onPress={confirmWithdraw}>
                <Text style={styles.dialogBtnDangerText}>Withdraw</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: {},
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 60 },
  backText: { fontSize: 15, color: COLORS.purple, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  formBody: { padding: 20, gap: 4 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSub, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: COLORS.text,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationInput: { flex: 1 },
  locateBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.purpleLight,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateIcon: { fontSize: 20 },
  selectInput: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectText: { fontSize: 15, color: COLORS.text, flex: 1 },
  selectArrow: { fontSize: 16, marginLeft: 8 },
  textArea: { height: 110, paddingTop: 12 },
  petScrollContent: { gap: 10, paddingVertical: 4 },
  petChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 130,
  },
  petChipActive: {
    borderColor: COLORS.purple,
    backgroundColor: COLORS.purpleLight,
  },
  petChipPhoto: { width: 40, height: 40, borderRadius: 20 },
  petChipEmoji: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  petChipEmojiActive: { backgroundColor: '#FFFFFF', borderColor: '#DDD6FE' },
  petChipEmojiText: { fontSize: 20 },
  petChipInfo: { flex: 1 },
  petChipName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  petChipNameActive: { color: COLORS.purple },
  petChipBreed: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  petChipCheck: { fontSize: 14, color: COLORS.purple, fontWeight: '700' },
  photoScrollContent: { gap: 10, paddingVertical: 4 },
  photoThumbWrap: { width: 84, height: 84 },
  photoThumb: { width: 84, height: 84, borderRadius: 14, backgroundColor: COLORS.card },
  photoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.bg,
  },
  photoRemoveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  addPhotoTile: {
    width: 84,
    height: 84,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoIcon: { fontSize: 22, color: COLORS.purple, fontWeight: '300' },
  addPhotoText: { fontSize: 10, color: COLORS.purple, fontWeight: '600' },
  withdrawBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    marginTop: 8,
  },
  withdrawText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
  ctaContainer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  ctaButton: {
    backgroundColor: COLORS.purple,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },

  // Withdraw confirmation dialog
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dialogCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  dialogIcon: {
    width: 80, height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: '#FECACA',
  },
  dialogIconText: { fontSize: 34 },
  dialogTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  dialogMessage: {
    fontSize: 14,
    color: COLORS.textSub,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  dialogInfoChip: {
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
    gap: 4,
    alignSelf: 'stretch',
  },
  dialogInfoText: { fontSize: 13, color: COLORS.text, fontWeight: '500', textAlign: 'center' },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  dialogBtnSecondary: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dialogBtnSecondaryText: { color: COLORS.textSub, fontSize: 15, fontWeight: '600' },
  dialogBtnDanger: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  dialogBtnDangerText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
