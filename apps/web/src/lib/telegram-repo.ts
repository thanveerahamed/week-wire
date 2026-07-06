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
  channelLinked: boolean;
  channelTitle: string | null;
  channelUsername: string | null;
  groupLinked: boolean;
  groupTitle: string | null;
  groupTopicId: number | null;
  groupTopicName: string | null;
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
      channelLinked: false,
      channelTitle: null,
      channelUsername: null,
      groupLinked: false,
      groupTitle: null,
      groupTopicId: null,
      groupTopicName: null,
    };
  }
  const data = snap.data() ?? {};
  return {
    configured: true,
    botUsername: (data.botUsername as string | undefined) ?? null,
    chatLinked: typeof data.chatId === 'number',
    linkSecret: (data.linkSecret as string | undefined) ?? null,
    webhookSetAt: (data.webhookSetAt as number | undefined) ?? null,
    channelLinked: typeof data.channelChatId === 'number',
    channelTitle: (data.channelTitle as string | undefined) ?? null,
    channelUsername: (data.channelUsername as string | undefined) ?? null,
    groupLinked: typeof data.groupChatId === 'number',
    groupTitle: (data.groupTitle as string | undefined) ?? null,
    groupTopicId: (data.groupTopicId as number | undefined) ?? null,
    groupTopicName: (data.groupTopicName as string | undefined) ?? null,
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

export async function getLinkedChat(
  uid: string,
): Promise<{ chatId: number; botToken: string } | null> {
  const snap = await configRef(uid).get();
  const data = snap.data();
  const chatId = data?.chatId as number | undefined;
  const enc = data?.botTokenEnc as string | undefined;
  if (typeof chatId !== 'number' || !enc) return null;
  try {
    return { chatId, botToken: decryptField(enc) };
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

export async function getLinkedChannel(
  uid: string,
): Promise<{ chatId: number; title: string | null; botToken: string } | null> {
  const snap = await configRef(uid).get();
  const data = snap.data();
  const chatId = data?.channelChatId as number | undefined;
  const enc = data?.botTokenEnc as string | undefined;
  if (typeof chatId !== 'number' || !enc) return null;
  try {
    return { chatId, title: (data?.channelTitle as string | undefined) ?? null, botToken: decryptField(enc) };
  } catch {
    return null;
  }
}

export async function linkChannel(
  uid: string,
  args: { chatId: number; title: string | null; username: string | null },
): Promise<void> {
  await configRef(uid).set(
    {
      channelChatId: args.chatId,
      channelTitle: args.title,
      channelUsername: args.username,
      channelLinkedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function unlinkChannel(uid: string): Promise<void> {
  await configRef(uid).set(
    {
      channelChatId: FieldValue.delete(),
      channelTitle: FieldValue.delete(),
      channelUsername: FieldValue.delete(),
      channelLinkedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getLinkedGroup(
  uid: string,
): Promise<{ chatId: number; topicId: number | null; title: string | null; botToken: string } | null> {
  const snap = await configRef(uid).get();
  const data = snap.data();
  const chatId = data?.groupChatId as number | undefined;
  const enc = data?.botTokenEnc as string | undefined;
  if (typeof chatId !== 'number' || !enc) return null;
  try {
    return {
      chatId,
      topicId: (data?.groupTopicId as number | undefined) ?? null,
      title: (data?.groupTitle as string | undefined) ?? null,
      botToken: decryptField(enc),
    };
  } catch {
    return null;
  }
}

export async function linkGroup(
  uid: string,
  args: { chatId: number; title: string | null; topicId: number | null; topicName: string | null },
): Promise<void> {
  await configRef(uid).set(
    {
      groupChatId: args.chatId,
      groupTitle: args.title,
      groupTopicId: args.topicId,
      groupTopicName: args.topicName,
      groupLinkedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function unlinkGroup(uid: string): Promise<void> {
  await configRef(uid).set(
    {
      groupChatId: FieldValue.delete(),
      groupTitle: FieldValue.delete(),
      groupTopicId: FieldValue.delete(),
      groupTopicName: FieldValue.delete(),
      groupLinkedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
