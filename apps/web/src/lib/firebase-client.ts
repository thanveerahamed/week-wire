'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth, GoogleAuthProvider } from 'firebase/auth';
import { publicFirebaseConfig } from './firebase-public';

let app: FirebaseApp | undefined;

export function firebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps()[0] ?? initializeApp(publicFirebaseConfig());
  return app;
}

export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}

export function googleProvider(): GoogleAuthProvider {
  const p = new GoogleAuthProvider();
  // Only request the email/profile needed for identity here.
  // Calendar scopes are requested via the separate offline OAuth flow.
  p.addScope('email');
  p.addScope('profile');
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
}
