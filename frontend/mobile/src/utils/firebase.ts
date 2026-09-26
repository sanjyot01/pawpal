import { initializeApp, getApps } from 'firebase/app';
import { getStorage } from 'firebase/storage';

// Go to Firebase Console → Project Settings → Your apps → Web app → Config
// https://console.firebase.google.com/
const firebaseConfig = {
  apiKey: "YOUR_GOOGLE_API_KEY",
  authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
  databaseURL: "YOUR_FIREBASE_DATABASE_U_R_L",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const storage = getStorage(app);
