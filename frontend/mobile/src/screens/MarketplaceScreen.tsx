import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS } from '../constants/colors';
import { ItemCard } from '../components/ItemCard';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiGet, errorMessage } from '../utils/api';
import { MarketItem, categoryEmoji, conditionLabel } from '../constants/market';
// Re-exported so existing importers keep working; the definitions moved to break
// a require cycle with ItemCard.
export { categoryEmoji, conditionLabel };
export type { MarketItem };

type SortOption = 'NEWEST' | 'PRICE_LOW' | 'PRICE_HIGH';

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface MarketplaceScreenProps {
  navigation: any;
}

export const MarketplaceScreen: React.FC<MarketplaceScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState('All');
  const [feed, setFeed] = useState<MarketItem[]>([]);
  const [myItems, setMyItems] = useState<MarketItem[]>([]);
  const [unreadMsg, setUnreadMsg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string>();

  const [conditionFilter, setConditionFilter] = useState('All');

  // Sort / price / listed-date filters — applied client-side over the already-fetched feed
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('NEWEST');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [fromPickerVisible, setFromPickerVisible] = useState(false);
  const [toPickerVisible, setToPickerVisible] = useState(false);
  // Draft copies edited inside the modal — only committed to the real filters on "Apply"
  const [draftSortBy, setDraftSortBy] = useState<SortOption>('NEWEST');
  const [draftPriceMin, setDraftPriceMin] = useState('');
  const [draftPriceMax, setDraftPriceMax] = useState('');
  const [draftDateFrom, setDraftDateFrom] = useState<Date | null>(null);
  const [draftDateTo, setDraftDateTo] = useState<Date | null>(null);

  const filters = ['All', 'Toys', 'Carriers', 'Food', 'Accessories', 'Other'];
  const categoryMap: Record<string, string> = {
    Toys: 'TOY',
    Carriers: 'CARRIER',
    Food: 'FOOD',
    Accessories: 'ACCESSORY',
    Other: 'OTHER',
  };

  const conditionFilters = ['All', 'New', 'Like New', 'Good', 'Fair'];
  const conditionMap: Record<string, string> = {
    New: 'NEW',
    'Like New': 'LIKE_NEW',
    Good: 'GOOD',
    Fair: 'FAIR',
  };

  const activeFilterCount =
    (priceMin.trim() ? 1 : 0) + (priceMax.trim() ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)
    + (sortBy !== 'NEWEST' ? 1 : 0);

  const openFilterModal = () => {
    setDraftSortBy(sortBy);
    setDraftPriceMin(priceMin);
    setDraftPriceMax(priceMax);
    setDraftDateFrom(dateFrom);
    setDraftDateTo(dateTo);
    setFilterModalVisible(true);
  };

  const applyFilters = () => {
    setSortBy(draftSortBy);
    setPriceMin(draftPriceMin);
    setPriceMax(draftPriceMax);
    setDateFrom(draftDateFrom);
    setDateTo(draftDateTo);
    setFilterModalVisible(false);
  };

  const clearDraftFilters = () => {
    setDraftSortBy('NEWEST');
    setDraftPriceMin('');
    setDraftPriceMax('');
    setDraftDateFrom(null);
    setDraftDateTo(null);
  };

  let displayedFeed = conditionFilter === 'All'
    ? feed
    : feed.filter(item => item.condition === conditionMap[conditionFilter]);

  const minVal = parseFloat(priceMin);
  const maxVal = parseFloat(priceMax);
  if (!isNaN(minVal)) displayedFeed = displayedFeed.filter(item => (item.price ?? 0) >= minVal);
  if (!isNaN(maxVal)) displayedFeed = displayedFeed.filter(item => (item.price ?? 0) <= maxVal);
  if (dateFrom) {
    const from = dateFrom.getTime();
    displayedFeed = displayedFeed.filter(item => item.createdAt && new Date(item.createdAt).getTime() >= from);
  }
  if (dateTo) {
    // Inclusive of the whole "to" day
    const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
    const toMs = to.getTime();
    displayedFeed = displayedFeed.filter(item => item.createdAt && new Date(item.createdAt).getTime() <= toMs);
  }
  if (sortBy === 'PRICE_LOW') {
    displayedFeed = [...displayedFeed].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  } else if (sortBy === 'PRICE_HIGH') {
    displayedFeed = [...displayedFeed].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  }

  const loadData = useCallback(async () => {
    try {
      setLoadError(undefined);
      const categoryParam = activeFilter !== 'All' ? `?category=${categoryMap[activeFilter]}` : '';
      const [feedItems, mine] = await Promise.all([
        apiGet<MarketItem[]>(`/api/market/items${categoryParam}`),
        apiGet<MarketItem[]>('/api/market/items/my'),
      ]);
      setFeed(feedItems);
      setMyItems(mine);
    } catch (e) {
      // Otherwise a failed load reads as "this category is empty" and sends
      // people off to browse a filter that was never actually fetched.
      setLoadError(errorMessage(e, 'Could not load listings.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  // Unread badge only — stale is better than interrupting the grid, so a
  // failure here stays silent deliberately.
  const refreshUnread = useCallback(async () => {
    try {
      const counts = await apiGet<Record<string, number>>('/api/messages/unread-counts');
      setUnreadMsg(counts.MARKET ?? 0);
    } catch (_) {}
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
    refreshUnread();
    const interval = setInterval(refreshUnread, 5000);
    return () => clearInterval(interval);
  }, [loadData, refreshUnread]));

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>🛍️ Marketplace</Text>
            <Text style={styles.headerSub}>Pre-loved pet gear near you</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.chatsBtn}
              onPress={() => navigation.navigate('MarketChats')}
              activeOpacity={0.8}
            >
              <Text style={styles.chatsBtnText}>💬</Text>
              {unreadMsg > 0 && <View style={styles.chatsBtnDot} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sellBtn}
              onPress={() => navigation.navigate('PostMarketItem')}
              activeOpacity={0.8}
            >
              <Text style={styles.sellBtnText}>+ Sell</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* My Listings */}
      {myItems.length > 0 && (
        <View style={styles.mySection}>
          <Text style={styles.mySectionTitle}>My Listings</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.myScroll}
          >
            {myItems.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.myCard}
                onPress={() => navigation.navigate('PostMarketItem', { item })}
                activeOpacity={0.8}
              >
                <View style={styles.myCardImage}>
                  {item.photoUrl ? (
                    <Image source={{ uri: item.photoUrl }} style={styles.myCardPhoto} />
                  ) : (
                    <Text style={styles.myCardEmoji}>{categoryEmoji(item.category)}</Text>
                  )}
                  {item.status === 'SOLD' && (
                    <View style={styles.soldOverlay}>
                      <Text style={styles.soldText}>SOLD</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.myCardName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.myCardPrice}>${item.price ?? 0}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Filter chips */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {filters.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, f === activeFilter && styles.chipActive]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.chipText, f === activeFilter && styles.chipTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {conditionFilters.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, f === conditionFilter && styles.chipActive]}
              onPress={() => setConditionFilter(f)}
            >
              <Text style={[styles.chipText, f === conditionFilter && styles.chipTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.sortFilterRow}>
          <TouchableOpacity style={styles.filtersBtn} onPress={openFilterModal} activeOpacity={0.8}>
            <Text style={styles.filtersBtnText}>
              ⚙ Sort & Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Grid */}
      <FlatList
        data={displayedFeed}
        keyExtractor={(item) => item.id}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 20 }]}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : loadError ? (
            <ErrorNotice message={loadError} onRetry={loadData} />
          ) : (
            <View style={styles.emptyFeed}>
              <Text style={styles.emptyFeedText}>No items in this category yet.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            onPress={() => navigation.navigate('MarketplaceChat', { item, otherUserId: item.sellerUserId })}
          />
        )}
        columnWrapperStyle={styles.row}
      />

      {/* Sort & Filter modal */}
      <Modal visible={filterModalVisible} transparent animationType="slide" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Sort & Filter</Text>

              {/* Sort */}
              <Text style={styles.modalLabel}>Sort By</Text>
              <View style={styles.chipWrapRow}>
                {([
                  { key: 'NEWEST', label: 'Newest' },
                  { key: 'PRICE_LOW', label: 'Price: Low to High' },
                  { key: 'PRICE_HIGH', label: 'Price: High to Low' },
                ] as { key: SortOption; label: string }[]).map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.chip, draftSortBy === opt.key && styles.chipActive]}
                    onPress={() => setDraftSortBy(opt.key)}
                  >
                    <Text style={[styles.chipText, draftSortBy === opt.key && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Price range */}
              <Text style={styles.modalLabel}>Price Range ($)</Text>
              <View style={styles.rangeRow}>
                <TextInput
                  style={[styles.rangeInput, styles.input]}
                  value={draftPriceMin}
                  onChangeText={setDraftPriceMin}
                  placeholder="Min"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.rangeDash}>–</Text>
                <TextInput
                  style={[styles.rangeInput, styles.input]}
                  value={draftPriceMax}
                  onChangeText={setDraftPriceMax}
                  placeholder="Max"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Listed date range */}
              <Text style={styles.modalLabel}>Listed Between</Text>
              <View style={styles.rangeRow}>
                <TouchableOpacity
                  style={[styles.rangeInput, styles.input, styles.dateInput]}
                  onPress={() => setFromPickerVisible(true)}
                >
                  <Text style={draftDateFrom ? styles.dateText : styles.datePlaceholder}>
                    {draftDateFrom ? formatShortDate(draftDateFrom) : 'From'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.rangeDash}>–</Text>
                <TouchableOpacity
                  style={[styles.rangeInput, styles.input, styles.dateInput]}
                  onPress={() => setToPickerVisible(true)}
                >
                  <Text style={draftDateTo ? styles.dateText : styles.datePlaceholder}>
                    {draftDateTo ? formatShortDate(draftDateTo) : 'To'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.clearBtn} onPress={clearDraftFilters}>
                  <Text style={styles.clearBtnText}>Clear All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
                  <Text style={styles.applyBtnText}>Apply</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setFilterModalVisible(false)}>
                <Text style={styles.modalCloseBtnText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <DateTimePickerModal
        isVisible={fromPickerVisible}
        mode="date"
        maximumDate={draftDateTo ?? undefined}
        onConfirm={(d) => { setDraftDateFrom(d); setFromPickerVisible(false); }}
        onCancel={() => setFromPickerVisible(false)}
        display={Platform.OS === 'ios' ? 'inline' : 'default'}
        accentColor={COLORS.primary}
      />
      <DateTimePickerModal
        isVisible={toPickerVisible}
        mode="date"
        minimumDate={draftDateFrom ?? undefined}
        onConfirm={(d) => { setDraftDateTo(d); setToPickerVisible(false); }}
        onCancel={() => setToPickerVisible(false)}
        display={Platform.OS === 'ios' ? 'inline' : 'default'}
        accentColor={COLORS.primary}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 14,
    color: COLORS.textSub,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatsBtnText: { fontSize: 18 },
  chatsBtnDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: COLORS.card,
  },
  sellBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 100,
  },
  sellBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  mySection: {
    backgroundColor: COLORS.card,
    paddingBottom: 12,
  },
  mySectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    paddingHorizontal: 20,
    paddingTop: 12,
    marginBottom: 8,
  },
  myScroll: { paddingHorizontal: 16, gap: 10 },
  myCard: {
    width: 110,
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
    gap: 3,
  },
  myCardImage: {
    height: 70,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  myCardPhoto: { width: '100%', height: '100%' },
  myCardEmoji: { fontSize: 32 },
  soldOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  myCardName: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  myCardPrice: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  filterSection: {
    backgroundColor: COLORS.card,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
    paddingTop: 12,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSub,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  grid: {
    padding: 10,
  },
  row: {
    justifyContent: 'flex-start',
  },
  emptyFeed: { alignItems: 'center', paddingVertical: 40 },
  emptyFeedText: { fontSize: 14, color: COLORS.textMuted },
  sortFilterRow: { paddingHorizontal: 16, paddingTop: 10 },
  filtersBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 100,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  filtersBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSub, marginBottom: 8, marginTop: 16 },
  chipWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rangeInput: { flex: 1 },
  rangeDash: { fontSize: 15, color: COLORS.textMuted },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: COLORS.text,
  },
  dateInput: { justifyContent: 'center' },
  dateText: { fontSize: 15, color: COLORS.text },
  datePlaceholder: { fontSize: 15, color: COLORS.textMuted },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  clearBtn: {
    flex: 1,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  clearBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.textSub },
  applyBtn: {
    flex: 1,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  applyBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  modalCloseBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  modalCloseBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
});
