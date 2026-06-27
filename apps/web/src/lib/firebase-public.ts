/**
 * Public Firebase client SDK config. Safe to expose: these are public identifiers
 * gated by Firebase Auth and Firestore Security Rules.
 */
const PublicEnvSchemaKeys = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
] as const;

export interface PublicFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export function publicFirebaseConfig(): PublicFirebaseConfig {
  // In Next.js client bundles, dynamic `process.env[key]` reads are not
  // populated. Use static reads so NEXT_PUBLIC_* values are inlined at build.
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  const missing = [
    apiKey ? null : PublicEnvSchemaKeys[0],
    authDomain ? null : PublicEnvSchemaKeys[1],
    projectId ? null : PublicEnvSchemaKeys[2],
    appId ? null : PublicEnvSchemaKeys[3],
  ].filter((k): k is (typeof PublicEnvSchemaKeys)[number] => k !== null);
  if (missing.length) {
    throw new Error(
      `Missing public Firebase env vars: ${missing.join(', ')}. ` +
        `Copy .env.example to .env.local and fill them in.`,
    );
  }
  return {
    apiKey: apiKey!,
    authDomain: authDomain!,
    projectId: projectId!,
    appId: appId!,
  };
}
