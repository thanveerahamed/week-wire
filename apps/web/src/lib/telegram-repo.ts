import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { decryptField, encryptField } from '@week-wire/shared';
import { adminDb } from './firebase-admin';
import { serverEnv } from './env';

export interface TelegramStatus {
  configured: boolean;
  botUsername: string | null;
  chatLinked: boolean;
  linkSecret: string | null;
  webhookSetAt: number | null;
}

function configRef(uid: string) {
  return adminDb().collection('users').doc(uid).collection('telegram').doc('config');
}

/**
 * Per-user webhook secret token. Telegram echoes this in the
 * `X-Telegram-Bot-Api-Secret-Token` header on every update.
 */
export function webhookSecretFor(uid: string): string {
  const env = serverEnv();
  // Telegram requires 1–256 chars matching [A-Za-z0-9_-]. Hex satisfies that.
  return createHmac('sha256', env.WEBHOOK_SECRET).update(`tg:${uid}`).digest('hex');
}

export function webhookUrlFor(uid: string, appUrl?: string): string {
  const env = serverEnv();
  const origin = (appUrl ?? env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/u, '');
  return `${origin}/api/telegram/webhook/${encodeURIComponent(uid)}`;
}

export function newLinkSecret(): string {
  // 16 bytes → 22 url-safe chars. Used as `/start <secret>` payload.
  return randomBytes(16).toString('base64url');
}

export async function getStatus(uid: string): Promise<TelegramStatus> {
  const snap = await configRef(uid).get();
  if (!snap.exists) {
    return {
      configured: false,
      botUsername: null,
      chatLinked: false,
      linkSecret: null,
      webhookSetAt: null,
    };
  }
  const data = snap.data() ?? {};
  return {
    configured: true,
    botUsername: (data.botUsername as string | undefined) ?? null,
    chatLinked: typeof data.chatId === 'number',
    linkSecret: (data.linkSecret as string | undefined) ?? null,
    webhookSetAt: (data.webhookSetAt as number | undefined) ?? null,
  };
}

export async function saveBotConfig(
  uid: string,
  args: { botToken: string; botUsername: string },
): Promise<{ linkSecret: string }> {
  const existing = await configRef(uid).get();
  const linkSecret = (existing.data()?.linkSecret as string | undefined) ?? newLinkSecret();
  await configRef(uid).set(
    {
      botTokenEnc: encryptField(args.botToken),
      botUsername: args.botUsername,
      linkSecret,
      // Preserve chatId if already linked AND the bot identity hasn't changed.
      ...(existing.data()?.botUsername === args.botUsername
        ? {}
        : { chatId: FieldValue.delete() }),
      webhookSetAt: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { linkSecret };
}

export async function clearBotConfig(uid: string): Promise<string | null> {
  const snap = await configRef(uid).get();
  if (!snap.exists) return null;
  const enc = snap.data()?.botTokenEnc as string | undefined;
  await configRef(uid).delete();
  if (!enc) return null;
  try {
    return decryptField(enc);
  } catch {
    return null;
  }
}

export async function findByLinkSecret(linkSecret: string): Promise<
  | {
      uid: string;
      botToken: string;
    }
  | null
> {
  const snap = await adminDb()
    .collectionGroup('telegram')
    .where('linkSecret', '==', linkSecret)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  // Path: users/{uid}/telegram/config
  const uid = doc.ref.parent.parent?.id;
  if (!uid) return null;
  const enc = doc.data().botTokenEnc as string | undefined;
  if (!enc) return null;
  return { uid, botToken: decryptField(enc) };
}

export async function loadBotToken(uid: string): Promise<string | null> {
  const snap = await configRef(uid).get();
  const enc = snap.data()?.botTokenEnc as string | undefined;
  if (!enc) return null;
  try {
    return decryptField(enc);
  } catch {
    return null;
  }
}

export async function setLinkedChat(uid: string, chatId: number): Promise<void> {
  await configRef(uid).set(
    {
      chatId,
      linkedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
