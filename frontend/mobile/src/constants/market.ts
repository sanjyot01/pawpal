/**
 * Market types and label helpers.
 *
 * These lived in MarketplaceScreen, which ItemCard imported from — while
 * MarketplaceScreen imported ItemCard. Metro allows require cycles but warns,
 * and the warning opened a full-screen console overlay on top of the app in dev.
 * The values are shared vocabulary, not screen state, so they belong here.
 */

export interface MarketItem {
  id: string;
  sellerUserId: string;
  name: string;
  description?: string;
  category: string;   // TOY, CARRIER, FOOD, ACCESSORY, OTHER
  price?: number;
  originalPrice?: number;
  condition: string;  // NEW, LIKE_NEW, GOOD, FAIR
  photoUrl?: string;
  location?: string;
  status: string;     // ACTIVE, SOLD, WITHDRAWN
  sellerName?: string;
  sellerAvatarUrl?: string;
  unreadMessageCount?: number;
  imageUrls?: string[];
  createdAt?: string;
}

export const categoryEmoji = (category?: string) => {
  switch (category) {
    case 'TOY': return '🧸';
    case 'CARRIER': return '🎒';
    case 'FOOD': return '🥫';
    case 'ACCESSORY': return '🦴';
    default: return '📦';
  }
};

export const conditionLabel = (condition?: string) => {
  switch (condition) {
    case 'NEW': return 'New';
    case 'LIKE_NEW': return 'Like New';
    case 'GOOD': return 'Good';
    case 'FAIR': return 'Fair';
    default: return condition || 'Good';
  }
};
