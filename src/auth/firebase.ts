// Google / Apple / Facebook sign-in and cloud save via Firebase. Lazy-loaded: this file (and the
// Firebase SDK) is only fetched on self-hosted builds that define VITE_FIREBASE_* (see docs/TECHNICAL.md).
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc, type Firestore } from 'firebase/firestore';
import type { GameState } from '../core/state';
import type { CloudBackend, SocialProvider } from './account';

let app: FirebaseApp | null = null;
let auth: Auth;
let db: Firestore;

function init(): void {
  if (app) return;
  app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  auth = getAuth(app);
  db = getFirestore(app);
  void setPersistence(auth, browserLocalPersistence);
}

function providerFor(p: SocialProvider) {
  if (p === 'google') return new GoogleAuthProvider();
  if (p === 'facebook') return new FacebookAuthProvider();
  const apple = new OAuthProvider('apple.com');
  apple.addScope('name'); // display name only; we never request email
  return apple;
}

function providerOf(u: User): SocialProvider {
  const id = u.providerData[0]?.providerId ?? '';
  return id.includes('apple') ? 'apple' : id.includes('facebook') ? 'facebook' : 'google';
}

/** Cloud save at saves/{uid}; firestore.rules allows each player to read and write only their own doc. */
function backendFor(u: User): CloudBackend {
  const ref = doc(db, 'saves', u.uid);
  return {
    async load() {
      const snap = await getDoc(ref);
      const d = snap.data();
      if (!d || typeof d.state !== 'string') return null;
      return { state: JSON.parse(d.state) as GameState, savedAt: Number(d.savedAt ?? 0) };
    },
    async save(b) {
      await setDoc(ref, { state: JSON.stringify(b.state), savedAt: b.savedAt });
    },
    async signOut() {
      await fbSignOut(auth);
    },
  };
}

const firstName = (u: User) => (u.displayName ?? '').split(' ')[0] || 'Captain';

export async function restoreSession(): Promise<{ backend: CloudBackend; provider: SocialProvider; name: string } | null> {
  init();
  // a redirect sign-in (mobile fallback) finishes here on the next page load
  await getRedirectResult(auth).catch(() => null);
  const user = await new Promise<User | null>((res) => {
    const off = onAuthStateChanged(auth, (u) => {
      off();
      res(u);
    });
  });
  return user ? { backend: backendFor(user), provider: providerOf(user), name: firstName(user) } : null;
}

export async function signIn(p: SocialProvider): Promise<{ backend: CloudBackend; name: string }> {
  init();
  try {
    const cred = await signInWithPopup(auth, providerFor(p));
    return { backend: backendFor(cred.user), name: firstName(cred.user) };
  } catch (e) {
    // Popups are often blocked in mobile in-app browsers: fall back to a full-page redirect.
    if ((e as { code?: string }).code === 'auth/popup-blocked') await signInWithRedirect(auth, providerFor(p));
    throw e;
  }
}
