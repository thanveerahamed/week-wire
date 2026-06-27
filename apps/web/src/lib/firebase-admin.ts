/**
 * Firebase Admin singleton. Server-only.
 *
 * Credential resolution order:
 *  1. GOOGLE_SERVICE_ACCOUNT_JSON env var (JSON string) — used on Vercel and
 *     any non-GCP host where ADC is not available.
 *  2. Application Default Credentials — used on GCP (App Hosting, Cloud Run,
 *     Cloud Functions) and locally via GOOGLE_APPLICATION_CREDENTIALS.
 */
import 'server-only';

import {
  getApps,
  initializeApp,
  applicationDefault,
  cert,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App | undefined;

export function adminApp(): App {
  if (app) return app;

  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const credential = saJson
    ? cert(JSON.parse(saJson) as ServiceAccount)
    : applicationDefault();

  app =
    getApps()[0] ??
    initializeApp({
      credential,
      // Do not pass projectId explicitly: on App Hosting it is auto-detected
      // from FIREBASE_CONFIG; for cert() (Vercel) it is embedded in the SA JSON.
      // Passing it risks using an unsubstituted "${PROJECT_ID}" template literal.
    });
  return app;
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}
