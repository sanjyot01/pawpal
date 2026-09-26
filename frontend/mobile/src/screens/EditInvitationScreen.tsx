import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS } from '../constants/colors';
import { RouteMapPicker } from '../components/RouteMapPicker';
import { apiPut, apiDelete } from '../utils/api';

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface EditInvitationScreenProps {
  navigation: any;
  route: any;
}

export const EditInvitationScreen: React.FC<EditInvitationScreenProps> = ({ navigation, route: navRoute }) => {
  const insets = useSafeAreaInsets();
  const invitation = navRoute?.params?.invitation;

  const [routeText, setRouteText] = useState(invitation?.route || '');
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [duration, setDuration] = useState(String(invitation?.durationMinutes || 60));
  const [maxSpots, setMaxSpots] = useState(String(invitation?.maxSpots || 4));
  const [message, setMessage] = useState(invitation?.message || '');
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const dateLabel = selectedDate ? formatDate(selectedDate) : (invitation?.date || 'Select date');
  const timeLabel = selectedTime ? formatTime(selectedTime) : (invitation?.time || 'Select time');

  const handleSave = async () => {
    try {
      setSaving(true);
      await apiPut(`/api/walk/invitations/${invitation.id}`, {
        route: routeText.trim(),
        ...(routeCoords ? { latitude: routeCoords.latitude, longitude: routeCoords.longitude } : {}),
        date: selectedDate ? formatDate(selectedDate) : (invitation?.date || ''),
        time: selectedTime ? formatTime(selectedTime) : (invitation?.time || ''),
        message: message.trim() || undefined,
        durationMinutes: parseInt(duration, 10) || 60,
        maxSpots: parseInt(maxSpots, 10) || 4,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleWithdraw = () => {
    Alert.alert(
      'Withdraw Invitation',
      'Are you sure you want to withdraw this invitation? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              setWithdrawing(true);
              await apiDelete(`/api/walk/invitations/${invitation.id}`);
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to withdraw');
            } finally {
              setWithdrawing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <RouteMapPicker
        visible={mapVisible}
        onClose={() => setMapVisible(false)}
        onConfirm={(r, startCoord) => { setRouteText(r); setRouteCoords(startCoord); setMapVisible(false); }}
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
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={[styles.headerBar, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Invitation</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.formBody}>
          {/* Route */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>📍 Route / Meeting Point</Text>
            <TouchableOpacity
              style={[styles.input, styles.routeField]}
              onPress={() => setMapVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={routeText ? styles.routeText : styles.routePlaceholder} numberOfLines={1}>
                {routeText || 'Tap to select route on map'}
              </Text>
              <Text style={styles.mapIcon}>🗺</Text>
            </TouchableOpacity>
          </View>

          {/* Date */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>📅 Date</Text>
            <TouchableOpacity style={styles.selectInput} onPress={() => setDatePickerVisible(true)}>
              <Text style={selectedDate ? styles.selectText : styles.selectPlaceholder}>
                {dateLabel}
              </Text>
              <Text style={styles.selectArrow}>📅</Text>
            </TouchableOpacity>
          </View>

          {/* Time */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>⏰ Start Time</Text>
            <TouchableOpacity style={styles.selectInput} onPress={() => setTimePickerVisible(true)}>
              <Text style={selectedTime ? styles.selectText : styles.selectPlaceholder}>
                {timeLabel}
              </Text>
              <Text style={styles.selectArrow}>🕐</Text>
            </TouchableOpacity>
          </View>

          {/* Duration & Spots */}
          <View style={styles.rowFields}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>⏱ Duration (min)</Text>
              <TextInput
                style={styles.input}
                value={duration}
                onChangeText={setDuration}
                keyboardType="number-pad"
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
              placeholder="e.g. Friendly dogs only, no rush..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>
      </ScrollView>

      {/* Bottom actions */}
      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>💾  Save Changes</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.withdrawBtn, withdrawing && { opacity: 0.6 }]} onPress={handleWithdraw} disabled={withdrawing}>
          {withdrawing
            ? <ActivityIndicator color="#EF4444" />
            : <Text style={styles.withdrawBtnText}>🗑  Withdraw Invitation</Text>}
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
  textArea: { height: 90, paddingTop: 12 },
  rowFields: { flexDirection: 'row' },
  rowSpacer: { width: 12 },
  bottomActions: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 10,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  withdrawBtn: {
    borderRadius: 100,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  withdrawBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
});
