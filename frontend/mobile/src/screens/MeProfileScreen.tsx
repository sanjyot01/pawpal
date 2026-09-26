import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { COLORS } from '../constants/colors';
import { clearToken, apiGet } from '../utils/api';
import { unregisterPush } from '../utils/push';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  bio?: string;
  location?: string;
  avatarUrl?: string;
}

interface Pet {
  id: string;
  name: string;
  species: string;
  breed?: string;
  gender?: string;
  isVaccinated?: boolean;
  isNeutered?: boolean;
  bio?: string;
  profilePhotoUrl?: string;
  dateOfBirth?: string;
}

// Computed live against today, not stored — a pet born 2024-01-01 reads "2y" in
// 2026 and "1y" in 2025 without any data migration.
function petAgeLabel(dateOfBirth?: string): string | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  if (now.getDate() < dob.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years <= 0) return `${Math.max(months, 1)}mo`;
  return `${years}y`;
}

interface Stats {
  listings: number;
  pets: number;
  friends: number;
}

interface MeProfileScreenProps {
  navigation: any;
}

export const MeProfileScreen: React.FC<MeProfileScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [stats, setStats] = useState<Stats>({ listings: 0, pets: 0, friends: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [profileData, petsData, statsData] = await Promise.all([
        apiGet<UserProfile>('/api/users/me'),
        apiGet<Pet[]>('/api/pets/my'),
        apiGet<Stats>('/api/users/me/stats'),
      ]);
      setProfile(profileData);
      setPets(petsData);
      setStats(statsData);
    } catch (e) {
      // token expired or network error — stay on page, user can sign out
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load on mount and every time screen comes into focus (after EditProfile / AddPet)
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const firstPet = pets[0] ?? null;

  const petTags = (pet: Pet) => {
    const tags: string[] = [];
    if (pet.isVaccinated) tags.push('Vaccinated');
    if (pet.isNeutered) tags.push('Neutered');
    if (tags.length === 0) tags.push(pet.species);
    return tags;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* Header — the bell that used to sit here now lives once, on the Home map */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileAvatarWrap}>
          <View style={styles.profileAvatar}>
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.profileAvatarImage} />
            ) : (
              <Text style={styles.profileAvatarText}>👤</Text>
            )}
          </View>
          <TouchableOpacity style={styles.editAvatarBadge} onPress={() => navigation.navigate('EditProfile')}>
            <Text style={styles.editAvatarText}>📷</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{profile?.name ?? '—'}</Text>
          {profile?.bio ? (
            <Text style={styles.profileBio}>{profile.bio}</Text>
          ) : null}
          {profile?.location ? (
            <Text style={styles.profileLocation}>📍 {profile.location}</Text>
          ) : null}
          <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('EditProfile')}>
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Activity Stats */}
      <View style={styles.statsCard}>
        <Text style={styles.cardTitle}>My Activity</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.listings}</Text>
            <Text style={styles.statLabel}>Listings</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.pets}</Text>
            <Text style={styles.statLabel}>Pets</Text>
          </View>
        </View>
      </View>

      {/* My Pets */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.cardTitle}>🐾 My Pets</Text>
          <TouchableOpacity onPress={() => navigation.navigate('AddPet')}>
            <Text style={styles.addPetText}>+ Add Pet</Text>
          </TouchableOpacity>
        </View>

        {pets.length === 0 ? (
          <View style={styles.emptyPets}>
            <Text style={styles.emptyPetsText}>No pets yet. Add your first pet!</Text>
          </View>
        ) : (
          pets.map((pet, idx) => (
            <View key={pet.id} style={[styles.petRow, idx > 0 && styles.petRowBorder]}>
              <View style={styles.petAvatarContainer}>
                {pet.profilePhotoUrl ? (
                  <Image source={{ uri: pet.profilePhotoUrl }} style={styles.petAvatarImage} />
                ) : (
                  <Text style={styles.petAvatarEmoji}>
                    {pet.species === 'CAT' ? '🐈' : pet.species === 'OTHER' ? '🐾' : '🐕'}
                  </Text>
                )}
              </View>
              <View style={styles.petInfo}>
                <Text style={styles.petName}>{pet.name}</Text>
                <Text style={styles.petBreed}>
                  {[pet.breed, pet.gender, petAgeLabel(pet.dateOfBirth)].filter(Boolean).join(' · ')}
                </Text>
                <View style={styles.petTagsRow}>
                  {petTags(pet).map(tag => (
                    <View key={tag} style={styles.petTag}>
                      <Text style={styles.petTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <TouchableOpacity
                style={styles.viewProfileBtn}
                onPress={() => navigation.navigate('EditPet', { pet })}
              >
                <Text style={styles.viewProfileText}>Edit</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Sign Out */}
      <TouchableOpacity
        style={styles.signOutBtn}
        onPress={async () => {
          // Retire the push token BEFORE clearing the auth token: the unregister call is
          // authenticated, so the other order 401s and leaves this handset receiving the
          // previous account's notifications.
          await unregisterPush();
          await clearToken();
          // The local session is already gone by here, so a Google sign-out
          // failure must not strand someone on a screen they can't leave.
          try { await GoogleSignin.signOut(); } catch (_) {}
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        }}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: {
    fontSize: 20,
  },
  profileCard: {
    backgroundColor: COLORS.card,
    margin: 16,
    marginBottom: 0,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  profileAvatarWrap: {
    position: 'relative',
  },
  profileAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.primaryBorder,
  },
  profileAvatarText: {
    fontSize: 38,
  },
  profileAvatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  editAvatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.card,
  },
  editAvatarText: {
    fontSize: 11,
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  profileBio: {
    fontSize: 13,
    color: COLORS.textSub,
    lineHeight: 18,
  },
  profileLocation: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  editBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: 'flex-start',
  },
  editBtnText: {
    fontSize: 13,
    color: COLORS.textSub,
    fontWeight: '600',
  },
  statsCard: {
    backgroundColor: COLORS.card,
    margin: 16,
    marginBottom: 0,
    borderRadius: 18,
    padding: 18,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    margin: 16,
    marginBottom: 0,
    borderRadius: 18,
    padding: 18,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  addPetText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '700',
  },
  emptyPets: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyPetsText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  petRowBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 8,
    paddingTop: 16,
  },
  petAvatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petAvatarEmoji: {
    fontSize: 28,
  },
  petAvatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  petInfo: {
    flex: 1,
  },
  petName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  petBreed: {
    fontSize: 13,
    color: COLORS.textSub,
    marginBottom: 6,
  },
  petTagsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  petTag: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  petTagText: {
    fontSize: 11,
    color: COLORS.textSub,
  },
  viewProfileBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  viewProfileText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
  },
  signOutBtn: {
    margin: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.red,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 15,
    color: COLORS.red,
    fontWeight: '700',
  },
});
