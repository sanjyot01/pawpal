import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS } from '../constants/colors';
import { RouteMapPicker } from '../components/RouteMapPicker';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiPost, apiGet, errorMessage } from '../utils/api';

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

interface PostInvitationScreenProps {
  navigation: any;
}

export const PostInvitationScreen: React.FC<PostInvitationScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [route, setRoute] = useState('');
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [routeEndCoords, setRouteEndCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [duration, setDuration] = useState('60');
  const [maxSpots, setMaxSpots] = useState('4');
  const [saving, setSaving] = useState(false);
  const [petsError, setPetsError] = useState<string>();

  const loadPets = useCallback(() => {
    setPetsError(undefined);
    apiGet<Pet[]>('/api/pets/my')
      .then(setPets)
      // Silently empty, the pet selector just didn't render and there was no
      // way to tell that from genuinely owning no pets.
      .catch(e => setPetsError(errorMessage(e, 'Could not load your pets.')));
  }, []);

  useEffect(() => { loadPets(); }, [loadPets]);

  const handlePost = async () => {
    if (!route.trim()) { Alert.alert('Validation', 'Please set a route or meeting point.'); return; }
    if (!selectedDate) { Alert.alert('Validation', 'Please select a date.'); return; }
    if (!selectedTime) { Alert.alert('Validation', 'Please select a time.'); return; }
    try {
      setSaving(true);
      await apiPost('/api/walk/invitations', {
        route: route.trim(),
        date: formatDate(selectedDate),
        time: formatTime(selectedTime),
        message: message.trim() || undefined,
        durationMinutes: parseInt(duration, 10) || 60,
        maxSpots: parseInt(maxSpots, 10) || 4,
        ...(selectedPetIds.length > 0 ? { hostPetIds: selectedPetIds } : {}),
        ...(routeCoords ? { latitude: routeCoords.latitude, longitude: routeCoords.longitude } : {}),
        ...(routeEndCoords ? { endLatitude: routeEndCoords.latitude, endLongitude: routeEndCoords.longitude } : {}),
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to post invitation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <RouteMapPicker
        visible={mapVisible}
        onClose={() => setMapVisible(false)}
        onConfirm={(r, startCoord, endCoord) => {
          setRoute(r);
          setRouteCoords(startCoord);
          setRouteEndCoords(endCoord);
          setMapVisible(false);
        }}
      />
      <DateTimePickerModal
        isVisible={datePickerVisible}
        mode="date"
        minimumDate={new Date()}
        onConfirm={(d) => { setSelectedDate(d); setDatePickerVisible(false); }}
        onCancel={() => setDatePickerVisible(false)}
        display={Platform.OS === 'ios' ? 'inline' : 'default'}
        accentColor={COLORS.primary}
      />
      <DateTimePickerModal
        isVisible={timePickerVisible}
        mode="time"
        onConfirm={(d) => { setSelectedTime(d); setTimePickerVisible(false); }}
        onCancel={() => setTimePickerVisible(false)}
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        accentColor={COLORS.primary}
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
          <Text style={styles.headerTitle}>Post Invitation</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.formBody}>
          {/* Pet selector */}
          {petsError ? <ErrorNotice message={petsError} onRetry={loadPets} compact /> : null}
          {pets.length > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>🐾 Walking With</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.petScrollContent}
              >
                {pets.map(pet => {
                  const selected = selectedPetIds.includes(pet.id);
                  return (
                    <TouchableOpacity
                      key={pet.id}
                      style={[styles.petChip, selected && styles.petChipActive]}
                      onPress={() => setSelectedPetIds(prev =>
                        selected ? prev.filter(id => id !== pet.id) : [...prev, pet.id]
                      )}
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

          {/* Route */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>📍 Route / Meeting Point</Text>
            <TouchableOpacity
              style={[styles.input, styles.routeField]}
              onPress={() => setMapVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={route ? styles.routeText : styles.routePlaceholder} numberOfLines={1}>
                {route || 'e.g. Riverside Park entrance'}
              </Text>
              <Text style={styles.mapIcon}>🗺</Text>
            </TouchableOpacity>
          </View>

          {/* Date */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>📅 Date</Text>
            <TouchableOpacity style={styles.selectInput} onPress={() => setDatePickerVisible(true)}>
              <Text style={selectedDate ? styles.selectText : styles.selectPlaceholder}>
                {selectedDate ? formatDate(selectedDate) : 'Select date'}
              </Text>
              <Text style={styles.selectArrow}>📅</Text>
            </TouchableOpacity>
          </View>

          {/* Time */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>🕐 Time</Text>
            <TouchableOpacity style={styles.selectInput} onPress={() => setTimePickerVisible(true)}>
              <Text style={selectedTime ? styles.selectText : styles.selectPlaceholder}>
                {selectedTime ? formatTime(selectedTime) : 'Select time'}
              </Text>
              <Text style={styles.selectArrow}>🕐</Text>
            </TouchableOpacity>
          </View>

          {/* Duration & Max Spots */}
          <View style={styles.rowFields}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>⏱ Duration (min)</Text>
              <TextInput
                style={styles.input}
                value={duration}
                onChangeText={setDuration}
                keyboardType="number-pad"
                placeholder="60"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
            <View style={styles.rowSpacer} />
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>👥 Max Spots</Text>
              <TextInput
                style={styles.input}
                value={maxSpots}
                onChangeText={setMaxSpots}
                keyboardType="number-pad"
                placeholder="4"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
          </View>

          {/* Message */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>💬 Message (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              placeholder="Share a note with potential walk partners..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>💡 Tips for a great walk</Text>
            <Text style={styles.tipText}>• Be specific with your location to help others find you easily</Text>
            <Text style={styles.tipText}>• Choose a dog-friendly park or trail</Text>
            <Text style={styles.tipText}>• Update the invitation if your plans change</Text>
          </View>
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={[styles.ctaContainer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={[styles.ctaButton, saving && { opacity: 0.6 }]} onPress={handlePost} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.ctaText}>🐾 Post Invitation</Text>}
        </TouchableOpacity>
      </View>
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
  backText: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
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
  routeField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routeText: { fontSize: 15, color: COLORS.text, flex: 1 },
  routePlaceholder: { fontSize: 15, color: COLORS.textMuted, flex: 1 },
  mapIcon: { fontSize: 18, marginLeft: 8 },
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
  selectPlaceholder: { fontSize: 15, color: COLORS.textMuted, flex: 1 },
  selectArrow: { fontSize: 16, marginLeft: 8 },
  textArea: { height: 110, paddingTop: 12 },
  rowFields: { flexDirection: 'row' },
  rowSpacer: { width: 12 },
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
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  petChipPhoto: { width: 40, height: 40, borderRadius: 20 },
  petChipEmoji: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  petChipEmojiActive: { backgroundColor: '#FFFFFF', borderColor: COLORS.primaryBorder },
  petChipEmojiText: { fontSize: 20 },
  petChipInfo: { flex: 1 },
  petChipName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  petChipNameActive: { color: COLORS.primary },
  petChipBreed: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  petChipCheck: { fontSize: 14, color: COLORS.primary, fontWeight: '700' },
  tipCard: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    gap: 6,
    marginTop: 8,
  },
  tipTitle: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  tipText: { fontSize: 13, color: COLORS.text, lineHeight: 20 },
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
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});
