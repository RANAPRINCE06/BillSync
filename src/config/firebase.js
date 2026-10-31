import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyD8DC7spk2G52BNR8PvfDLWMcoS7yFSJAo",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "billsync-fa57a.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "billsync-fa57a",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "billsync-fa57a.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "437332542588",
  appId: env.VITE_FIREBASE_APP_ID || "1:437332542588:web:8bfc758c6dea6af57fb5f9",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || "G-NDF0XEFC06"
};

const app = initializeApp(firebaseConfig);

let analytics = null;
let db = null;
let auth = null;
let googleProvider = null;

try {
  db = getFirestore(app);
} catch (error) {
  console.warn("Cloud Firestore initialization warning:", error);
}

try {
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
} catch (error) {
  console.warn("Firebase Auth initialization warning:", error);
}

if (typeof window !== "undefined") {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch((error) => {
      console.error("Firebase Analytics initialization failed:", error);
    });
}

export { app, analytics, db, auth, googleProvider };
