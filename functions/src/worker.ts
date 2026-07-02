/**
 * Per-user digest send. Triggered by Pub/Sub messages from the dispatcher.
 *
 * Idempotency: a `runs/{runId}_{uid}` document is created via Firestore's
 * create(). If creation throws ALREADY_EXISTS, we skip. On transient
 * failure we delete the doc before throwing so Pub/Sub redelivery can
 * re-claim. The doc has an `expiresAt` field for Firestore TTL cleanup.
 */
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { db, FieldValue, Timestamp } from './firebase';
import { decryptField, formatDigest } from './shared-vendored';
import { collectUpcomingEvents } from './collector';
import { sendMessage, TelegramSendError } from './telegram';

export const DIGEST_USER_TOPIC = 'digest-user';

const FIELD_ENC_KEY = defineSecret('FIELD_ENC_KEY');
const GOOGLE_OAUTH_CLIENT_ID = defineSecret('GOOGLE_OAUTH_CLIENT_ID');
const GOOGLE_OAUTH_CLIENT_SECRET = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');

interface UserMessage {
  uid: string;
  runId: string;
  slot: '07' | '19';
}

function parseMessage(data: unknown): UserMessage | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (typeof o.uid !== 'string' || typeof o.runId !== 'string') return null;
  const slot = o.slot === '07' || o.slot === '19' ? o.slot : null;
  if (!slot) return null;
  return { uid: o.uid, runId: o.runId, slot };
}

interface UserPrefs {
  lookaheadDays: number;
  timezone: string;
  enabled: boolean;
}

const DEFAULT_PREFS: UserPrefs = {
  lookaheadDays: 7,
  timezone: 'Europe/Amsterdam',
  enabled: true,
};

async function loadPrefs(uid: string): Promise<UserPrefs | null> {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return {
    lookaheadDays:
      typeof data.lookaheadDays === 'number' ? data.lookaheadDays : DEFAULT_PREFS.lookaheadDays,
    timezone: typeof data.timezone === 'string' ? data.timezone : DEFAULT_PREFS.timezone,
    enabled: typeof data.enabled === 'boolean' ? data.enabled : DEFAULT_PREFS.enabled,
  };
}

interface TelegramConfig {
  botTokenEnc: string;
  chatId: number | null;
}

async function loadTelegram(uid: string): Promise<TelegramConfig | null> {
  const snap = await db.collection('users').doc(uid).collection('telegram').doc('config').get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const botTokenEnc = typeof data.botTokenEnc === 'string' ? data.botTokenEnc : null;
  if (!botTokenEnc) return null;
  const chatId = typeof data.chatId === 'number' ? data.chatId : null;
  return { botTokenEnc, chatId };
}

function runRef(uid: string, runId: string) {
  return db.collection('runs').doc(`${runId}_${uid}`);
}

async function claimRun(uid: string, runId: string): Promise<boolean> {
  const ref = runRef(uid, runId);
  try {
    const ttl = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await ref.create({
      uid,
      runId,
      startedAt: FieldValue.serverTimestamp(),
      expiresAt: ttl,
      status: 'running',
    });
    return true;
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 6) return false; // ALREADY_EXISTS
    throw err;
  }
}

async function releaseRun(uid: string, runId: string): Promise<void> {
  try {
    await runRef(uid, runId).delete();
  } catch (err) {
    logger.warn('failed to release run claim', { uid, runId, err });
  }
}

async function markRun(uid: string, runId: string, patch: Record<string, unknown>): Promise<void> {
  await runRef(uid, runId).set(
    { ...patch, finishedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export const sendUserDigest = onMessagePublished(
  {
    topic: DIGEST_USER_TOPIC,
    region: 'europe-west1',
    secrets: [FIELD_ENC_KEY, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET],
    retry: true,
    timeoutSeconds: 120,
    memory: '512MiB',
    concurrency: 20,
  },
  async (event) => {
    const msg = parseMessage(event.data.message.json);
    if (!msg) {
      logger.error('invalid message payload', { data: event.data.message.json });
      return;
    }
    const { uid, runId, slot } = msg;
    const ctx = { uid, runId, slot };

    const claimed = await claimRun(uid, runId);
    if (!claimed) {
      logger.info('run already claimed; skipping', ctx);
      return;
    }

    try {
      const prefs = await loadPrefs(uid);
      if (!prefs || !prefs.enabled) {
        logger.info('user disabled or missing; skipping', { ...ctx, hasPrefs: !!prefs });
        await markRun(uid, runId, { status: 'skipped', reason: 'disabled' });
        return;
      }
      const tg = await loadTelegram(uid);
      if (!tg) {
        logger.info('no telegram config; skipping', ctx);
        await markRun(uid, runId, { status: 'skipped', reason: 'no-telegram' });
        return;
      }
      if (tg.chatId == null) {
        logger.info('chat not linked; skipping', ctx);
        await markRun(uid, runId, { status: 'skipped', reason: 'no-chat' });
        return;
      }

      const events = await collectUpcomingEvents({
        uid,
        lookaheadDays: prefs.lookaheadDays,
        timezone: prefs.timezone,
      });
      const titleSuffix = slot === '07' ? 'morning' : 'evening';
      const markdown = formatDigest(events, {
        timezone: prefs.timezone,
        title: `WeekWire ${titleSuffix}`,
      });

      let botToken: string;
      try {
        botToken = decryptField(tg.botTokenEnc);
      } catch (err) {
        logger.error('failed to decrypt bot token', { ...ctx, err });
        await markRun(uid, runId, { status: 'failed', reason: 'decrypt-error' });
        return;
      }

      try {
        await sendMessage(botToken, {
          chat_id: tg.chatId,
          text: markdown,
          parse_mode: 'MarkdownV2',
        });
      } catch (err) {
        if (err instanceof TelegramSendError) {
          logger.warn('telegram send failed', {
            ...ctx,
            errorCode: err.errorCode,
            retryable: err.retryable,
            description: err.message,
          });
          if (err.errorCode === 401 || err.errorCode === 403) {
            await db
              .collection('users')
              .doc(uid)
              .collection('telegram')
              .doc('config')
              .set(
                {
                  lastError: {
                    code: err.errorCode,
                    message: err.message,
                    at: FieldValue.serverTimestamp(),
                  },
                  chatLinked: false,
                },
                { merge: true },
              );
            await markRun(uid, runId, {
              status: 'failed',
              reason: 'telegram-perm',
              errorCode: err.errorCode,
            });
            return;
          }
          if (err.retryable) {
            await releaseRun(uid, runId);
            throw err;
          }
          await markRun(uid, runId, {
            status: 'failed',
            reason: 'telegram-other',
            errorCode: err.errorCode,
          });
          return;
        }
        await releaseRun(uid, runId);
        throw err;
      }

      await markRun(uid, runId, {
        status: 'sent',
        eventCount: events.length,
      });
      logger.info('digest sent', { ...ctx, eventCount: events.length });
    } catch (err) {
      logger.error('digest run failed', { ...ctx, err });
      throw err;
    }
  },
);
