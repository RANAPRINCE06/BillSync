import { signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, googleProvider, db } from '../config/firebase';
import { getMockStore, saveMockStore } from '../data/mockData';

/**
 * Maps Firebase Auth error codes to user-friendly messages.
 */
export function getGoogleAuthErrorMessage(err) {
  if (!err) return 'Google sign-in failed. Please try again.';

  const code = err.code || '';
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Google sign-in window was closed before completion.';
    case 'auth/popup-blocked':
      return 'Pop-up window was blocked by your browser. Please allow pop-ups for this site and try again.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in action was initiated. Please try again.';
    case 'auth/network-request-failed':
      return 'Internet connection is unavailable. Please check your network connection.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Please contact your system administrator.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled in the Firebase Console. Please enable Google in Firebase Authentication > Sign-in method.';
    case 'auth/invalid-credential':
      return 'The Google authentication credentials were invalid or expired.';
    default:
      return err.message || 'Google authentication failed. Please try again.';
  }
}

/**
 * Authenticates with Google via Firebase Auth and retrieves or creates the user profile in Firestore.
 * 
 * @returns {Promise<Object>} The authenticated user profile
 */
export async function signInWithGoogle() {
  if (!auth || !googleProvider) {
    throw new Error('Firebase Authentication is not configured or available.');
  }

  // 1. Open Google account selection popup & authenticate
  const userCredential = await signInWithPopup(auth, googleProvider);
  const firebaseUser = userCredential.user;

  if (!firebaseUser || !firebaseUser.email) {
    throw new Error('Google did not provide a valid email address.');
  }

  const emailLower = firebaseUser.email.trim().toLowerCase();
  const uid = firebaseUser.uid;
  const displayName = firebaseUser.displayName || emailLower.split('@')[0];
  const photoURL = firebaseUser.photoURL || null;

  let userProfile = null;

  // 2. Check Cloud Firestore for existing user profile
  if (db) {
    try {
      const userDocRef = doc(db, 'users', uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        // Existing user: retrieve existing profile and preserve existing role
        const existingData = userDocSnap.data();
        userProfile = {
          ...existingData,
          id: uid,
          uid: uid,
          email: emailLower,
          name: existingData.name || displayName,
          photo_url: photoURL || existingData.photo_url || null,
          role: (existingData.role || 'CUSTOMER').toUpperCase(),
          account_status: existingData.account_status || 'ACTIVE',
          is_active: existingData.is_active !== false,
          last_login: new Date().toISOString(),
        };

        // Update last login timestamp without overwriting role or creation date
        updateDoc(userDocRef, {
          last_login: new Date().toISOString(),
          photo_url: photoURL || existingData.photo_url || null,
        }).catch(() => {});
      } else {
        // New user profile: determine initial role
        // New users default to CUSTOMER; only known bootstrap emails receive elevated roles
        let assignedRole = 'CUSTOMER';
        if (emailLower === 'admin@billsync.com') {
          assignedRole = 'ADMIN';
        } else if (emailLower === 'staff@billsync.com') {
          assignedRole = 'STAFF';
        }

        userProfile = {
          id: uid,
          uid: uid,
          name: displayName,
          email: emailLower,
          photo_url: photoURL,
          role: assignedRole,
          account_status: 'ACTIVE',
          is_active: true,
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
          provider: 'google.com',
        };

        // Persist to Cloud Firestore with UID as document ID
        await setDoc(userDocRef, userProfile).catch((err) => {
          console.warn('Could not persist user profile to Firestore backend:', err.message || err);
        });
      }
    } catch (err) {
      console.warn('Firestore user profile lookup failed, operating in fallback mode:', err.message || err);
    }
  }

  // 3. Fallback / Sync with local mock store
  const store = getMockStore();
  const existingLocalUser = (store.users || []).find(
    (u) => (u.uid && u.uid === uid) || (u.email && u.email.toLowerCase() === emailLower)
  );

  if (existingLocalUser) {
    // Preserve local user role if already existed
    const preservedRole = userProfile?.role || existingLocalUser.role || 'CUSTOMER';
    userProfile = {
      ...existingLocalUser,
      id: uid,
      uid: uid,
      name: userProfile?.name || existingLocalUser.name || displayName,
      email: emailLower,
      photo_url: photoURL || existingLocalUser.photo_url || null,
      role: preservedRole.toUpperCase(),
      account_status: existingLocalUser.account_status || 'ACTIVE',
      is_active: existingLocalUser.is_active !== false,
      last_login: new Date().toISOString(),
    };
  } else if (!userProfile) {
    let assignedRole = 'CUSTOMER';
    if (emailLower === 'admin@billsync.com') assignedRole = 'ADMIN';
    else if (emailLower === 'staff@billsync.com') assignedRole = 'STAFF';

    userProfile = {
      id: uid,
      uid: uid,
      name: displayName,
      email: emailLower,
      photo_url: photoURL,
      role: assignedRole,
      account_status: 'ACTIVE',
      is_active: true,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      provider: 'google.com',
    };
  }

  // Ensure user is present in mockStore.users without duplication
  if (!store.users) store.users = [];
  const filteredUsers = store.users.filter(
    (u) => (u.uid && u.uid !== uid) && (!u.email || u.email.toLowerCase() !== emailLower)
  );
  store.users = [userProfile, ...filteredUsers];

  // If user is a customer, ensure a linked customer profile exists in store.customers
  if (userProfile.role === 'CUSTOMER') {
    const existingCust = (store.customers || []).find(
      (c) => c.email && c.email.toLowerCase() === emailLower
    );
    if (!existingCust) {
      const newCust = {
        id: `cust-${Date.now().toString(36)}`,
        name: displayName,
        email: emailLower,
        phone: '',
        company: 'Individual Account',
        address: 'Self-Registered Customer',
        billing_address: 'Self-Registered Customer',
        notes: 'Registered via Google Authentication',
        created_at: new Date().toISOString(),
      };
      store.customers.unshift(newCust);
    }
  }

  saveMockStore(store);

  // 4. Session tokens & localStorage setup
  const token = `firebase-token-${uid}`;
  localStorage.setItem('access_token', token);
  localStorage.setItem('user', JSON.stringify(userProfile));

  return userProfile;
}

/**
 * Signs out the user from Firebase and clears active local session.
 */
export async function signOutUser() {
  if (auth) {
    try {
      await signOut(auth);
    } catch {
      /* ignore */
    }
  }
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
}
