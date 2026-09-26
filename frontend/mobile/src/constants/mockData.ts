export interface NearbyPet {
  id: string;
  name: string;
  emoji: string;
  breed: string;
  latitude: number;
  longitude: number;
  owner: string;
}

export interface WalkingPartner {
  id: string;
  name: string;
  emoji: string;
  breed: string;
  age: string;
  distance: string;
  time: string;
  tags: string[];
  rating: number;
  type: 'Dog' | 'Cat' | 'Other';
  owner: string;
  online?: boolean;
}

export interface BlindDatePet {
  id: string;
  name: string;
  emoji: string;
  breed: string;
  age: string;
  gender: string;
  distance: string;
  tags: string[];
  species: 'Dog' | 'Cat' | 'Other';
  vaccinated: boolean;
}

export interface Invitation {
  id: string;
  route: string;
  date: string;
  time: string;
  spotsLeft: number;
  totalSpots: number;
  emoji: string;
}

export type NotifCategory =
  | 'blind_date'
  | 'walk_request'
  | 'message'
  | 'like'
  | 'invitation'
  | 'match'
  | 'review'
  | 'marketplace';

export interface Notification {
  id: string;
  category: NotifCategory;
  emoji: string;
  senderName: string;
  petName: string;
  petEmoji: string;
  time: string;
  preview: string;
  isNew: boolean;
  categoryLabel: string;
  avatarUrl?: string;
}

export interface MarketplaceItem {
  id: string;
  emoji: string;
  name: string;
  price: number;
  originalPrice?: number;
  condition: string;
  sellerEmoji: string;
  sellerName: string;
  category: 'Toy' | 'Carrier' | 'Food' | 'Accessory';
}

export const nearbyPets: NearbyPet[] = [
  {
    id: '1',
    name: 'Buddy',
    emoji: '🐕',
    breed: 'Golden Retriever',
    latitude: 37.7749,
    longitude: -122.4194,
    owner: 'Jennifer T.',
  },
  {
    id: '2',
    name: 'Luna',
    emoji: '🐱',
    breed: 'Persian Cat',
    latitude: 37.776,
    longitude: -122.418,
    owner: 'Alex M.',
  },
  {
    id: '3',
    name: 'Max',
    emoji: '🐶',
    breed: 'Corgi',
    latitude: 37.7735,
    longitude: -122.421,
    owner: 'Sarah K.',
  },
  {
    id: '4',
    name: 'Mochi',
    emoji: '🐾',
    breed: 'Shiba Inu',
    latitude: 37.7755,
    longitude: -122.417,
    owner: 'Tom W.',
  },
];

export const walkingPartners: WalkingPartner[] = [
  {
    id: '1',
    name: 'Max',
    emoji: '🐕',
    breed: 'Golden Retriever',
    age: '2y',
    distance: '0.3 km',
    time: '7:00 AM',
    tags: ['Friendly', 'Vaccinated'],
    rating: 4.8,
    type: 'Dog',
    owner: 'Sarah K.',
    online: true,
  },
  {
    id: '2',
    name: 'Luna',
    emoji: '🐶',
    breed: 'Corgi',
    age: '3y',
    distance: '0.8 km',
    time: '8:30 AM',
    tags: ['Playful', 'Calm pace'],
    rating: 4.9,
    type: 'Dog',
    owner: 'Mike L.',
    online: true,
  },
  {
    id: '3',
    name: 'Buddy',
    emoji: '🐾',
    breed: 'Labrador',
    age: '1y',
    distance: '1.2 km',
    time: '9:00 AM',
    tags: ['Friendly', 'Puppy'],
    rating: 4.7,
    type: 'Dog',
    owner: 'Emma W.',
    online: false,
  },
  {
    id: '4',
    name: 'Mochi',
    emoji: '🐕',
    breed: 'Shiba Inu',
    age: '4y',
    distance: '1.5 km',
    time: '10:00 AM',
    tags: ['Calm', 'Vaccinated'],
    rating: 4.6,
    type: 'Dog',
    owner: 'James T.',
    online: false,
  },
  {
    id: '5',
    name: 'Whiskers',
    emoji: '🐱',
    breed: 'Ragdoll',
    age: '2y',
    distance: '1.3 km',
    time: '25 min',
    tags: ['Indoor', 'Gentle'],
    rating: 4.5,
    type: 'Cat',
    owner: 'Amy C.',
    online: false,
  },
  {
    id: '6',
    name: 'Rocky',
    emoji: '🐶',
    breed: 'Bulldog',
    age: '5y',
    distance: '1.6 km',
    time: '30 min',
    tags: ['Calm', 'Vaccinated', 'Friendly'],
    rating: 4.8,
    type: 'Dog',
    owner: 'Nate R.',
    online: false,
  },
];

export const blindDatePets: BlindDatePet[] = [
  {
    id: '1',
    name: 'Luna',
    emoji: '🐱',
    breed: 'Persian Cat',
    age: '2y',
    gender: 'Female',
    distance: '0.4 km',
    tags: ['Calm', 'Indoor', 'Vaccinated'],
    species: 'Cat',
    vaccinated: true,
  },
  {
    id: '2',
    name: 'Coco',
    emoji: '🐶',
    breed: 'Poodle',
    age: '3y',
    gender: 'Female',
    distance: '0.7 km',
    tags: ['Playful', 'Friendly', 'Vaccinated'],
    species: 'Dog',
    vaccinated: true,
  },
  {
    id: '3',
    name: 'Simba',
    emoji: '🐱',
    breed: 'Maine Coon',
    age: '4y',
    gender: 'Male',
    distance: '0.9 km',
    tags: ['Gentle', 'Vaccinated'],
    species: 'Cat',
    vaccinated: true,
  },
  {
    id: '4',
    name: 'Daisy',
    emoji: '🐕',
    breed: 'Corgi',
    age: '1y',
    gender: 'Female',
    distance: '1.2 km',
    tags: ['Energetic', 'Friendly', 'Puppy'],
    species: 'Dog',
    vaccinated: false,
  },
  {
    id: '5',
    name: 'Oliver',
    emoji: '🐱',
    breed: 'British Shorthair',
    age: '3y',
    gender: 'Male',
    distance: '1.4 km',
    tags: ['Calm', 'Indoor', 'Vaccinated'],
    species: 'Cat',
    vaccinated: true,
  },
  {
    id: '6',
    name: 'Tofu',
    emoji: '🐶',
    breed: 'Shiba Inu',
    age: '2y',
    gender: 'Male',
    distance: '1.8 km',
    tags: ['Independent', 'Vaccinated'],
    species: 'Dog',
    vaccinated: true,
  },
];

export const myInvitations: Invitation[] = [
  {
    id: '1',
    route: 'Riverside Park Trail',
    date: 'Sat, Jun 8',
    time: '9:00 AM',
    spotsLeft: 2,
    totalSpots: 4,
    emoji: '🌿',
  },
  {
    id: '2',
    route: 'Downtown Dog Walk',
    date: 'Sun, Jun 9',
    time: '7:30 AM',
    spotsLeft: 1,
    totalSpots: 3,
    emoji: '🏙️',
  },
];

export const notifications: Notification[] = [
  {
    id: '1',
    category: 'blind_date',
    emoji: '💕',
    senderName: 'Luna\'s Owner',
    petName: 'Luna',
    petEmoji: '🐱',
    time: '2 min ago',
    preview: 'Would love for Luna to meet Buddy! She\'s super friendly.',
    isNew: true,
    categoryLabel: 'Blind Date',
  },
  {
    id: '2',
    category: 'walk_request',
    emoji: '🚶',
    senderName: 'Sarah K.',
    petName: 'Max',
    petEmoji: '🐕',
    time: '15 min ago',
    preview: 'Hey! Max and I would love to join your walk tomorrow morning.',
    isNew: true,
    categoryLabel: 'Walk Request',
  },
  {
    id: '3',
    category: 'message',
    emoji: '💬',
    senderName: 'Alex M.',
    petName: 'Coco',
    petEmoji: '🐶',
    time: '1 hr ago',
    preview: 'The carrier is still available, can we meet at 5pm?',
    isNew: true,
    categoryLabel: 'Message',
  },
  {
    id: '4',
    category: 'like',
    emoji: '❤️',
    senderName: 'Tom W.',
    petName: 'Mochi',
    petEmoji: '🐾',
    time: '3 hr ago',
    preview: 'Tom liked your pet profile photo.',
    isNew: false,
    categoryLabel: 'Like',
  },
  {
    id: '5',
    category: 'invitation',
    emoji: '🌿',
    senderName: 'Jenny B.',
    petName: 'Bella',
    petEmoji: '🐶',
    time: '5 hr ago',
    preview: 'Jenny invited you to join the Riverside Park walk on Saturday.',
    isNew: false,
    categoryLabel: 'Invitation',
  },
  {
    id: '6',
    category: 'match',
    emoji: '✨',
    senderName: 'Mike R.',
    petName: 'Rocky',
    petEmoji: '🐶',
    time: 'Yesterday',
    preview: 'Rocky accepted your blind date request! Say hello.',
    isNew: false,
    categoryLabel: 'Match',
  },
  {
    id: '7',
    category: 'review',
    emoji: '⭐',
    senderName: 'Emma L.',
    petName: 'Charlie',
    petEmoji: '🐾',
    time: 'Yesterday',
    preview: 'Emma left a 5-star review: "Buddy is so well-behaved!"',
    isNew: false,
    categoryLabel: 'Review',
  },
  {
    id: '8',
    category: 'marketplace',
    emoji: '🛍️',
    senderName: 'Chris T.',
    petName: 'Oliver',
    petEmoji: '🐱',
    time: '2 days ago',
    preview: 'Someone is interested in your pet carrier listing.',
    isNew: false,
    categoryLabel: 'Marketplace',
  },
];

export const marketplaceItems: MarketplaceItem[] = [
  {
    id: '1',
    emoji: '🎒',
    name: 'Pet Carrier Bag',
    price: 25,
    originalPrice: 60,
    condition: 'Good',
    sellerEmoji: '👤',
    sellerName: 'Alex M.',
    category: 'Carrier',
  },
  {
    id: '2',
    emoji: '🧸',
    name: 'Squeaky Toy Set',
    price: 8,
    originalPrice: 20,
    condition: 'Like New',
    sellerEmoji: '👤',
    sellerName: 'Sarah K.',
    category: 'Toy',
  },
  {
    id: '3',
    emoji: '🥣',
    name: 'Premium Dog Food 5kg',
    price: 35,
    condition: 'Sealed',
    sellerEmoji: '👤',
    sellerName: 'Tom W.',
    category: 'Food',
  },
  {
    id: '4',
    emoji: '🎀',
    name: 'Cat Collar w/ Bell',
    price: 6,
    originalPrice: 15,
    condition: 'Good',
    sellerEmoji: '👤',
    sellerName: 'Jenny B.',
    category: 'Accessory',
  },
  {
    id: '5',
    emoji: '🏡',
    name: 'Cozy Pet Bed',
    price: 30,
    originalPrice: 70,
    condition: 'Good',
    sellerEmoji: '👤',
    sellerName: 'Mike R.',
    category: 'Accessory',
  },
  {
    id: '6',
    emoji: '🎾',
    name: 'Fetch Ball (3-pack)',
    price: 5,
    condition: 'New',
    sellerEmoji: '👤',
    sellerName: 'Emma L.',
    category: 'Toy',
  },
];
