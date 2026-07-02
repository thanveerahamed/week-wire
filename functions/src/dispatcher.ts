/**
 * Cron dispatcher. Runs at 07:00 and 19:00 Europe/Amsterdam, fetches all
 * enabled users, and publishes one Pub/Sub message per user to the
 * digest-user topic. The worker handles idempotency per (runId, uid).
 *
 * runId format: YYYY-MM-DD-HH in the Europe/Amsterdam wall clock.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { PubSub } from '@google-cloud/pubsub';
import { db } from './firebase';
import { DIGEST_USER_TOPIC } from './worker';

const TZ = 'Europe/Amsterdam';

function currentSlot(now: Date): { runId: string; slot: '07' | '19' } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  // Hour from Intl with hour12=false can be '24' at midnight in some locales — normalise.
  let hour = get('hour');
  if (hour === '24') hour = '00';
  const slot: '07' | '19' = Number(hour) < 13 ? '07' : '19';
  return { runId: `${date}-${slot}`, slot };
}

let _pubsub: PubSub | null = null;
function pubsub(): PubSub {
  if (!_pubsub) _pubsub = new PubSub();
  return _pubsub;
}

async function publishUser(uid: string, runId: string, slot: '07' | '19'): Promise<void> {
  const topic = pubsub().topic(DIGEST_USER_TOPIC);
  await topic.publishMessage({
    json: { uid, runId, slot },
    attributes: { uid, runId, slot },
  });
}

export const dispatchDigests = onSchedule(
  {
    schedule: '0 7,19 * * *',
    timeZone: TZ,
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async (event) => {
    const now = event.scheduleTime ? new Date(event.scheduleTime) : new Date();
    const { runId, slot } = currentSlot(now);
    logger.info('dispatch start', { runId, slot });

    const snap = await db.collection('users').where('enabled', '==', true).get();
    let published = 0;
    let failed = 0;
    // Limit parallel publishes to avoid hammering the API.
    const CHUNK = 25;
    const uids = snap.docs.map((d) => d.id);
    for (let i = 0; i < uids.length; i += CHUNK) {
      const slice = uids.slice(i, i + CHUNK);
      const results = await Promise.allSettled(slice.map((uid) => publishUser(uid, runId, slot)));
      for (const r of results) {
        if (r.status === 'fulfilled') published++;
        else {
          failed++;
          logger.error('publish failed', { runId, err: r.reason });
        }
      }
    }
    logger.info('dispatch complete', { runId, slot, published, failed, total: uids.length });
  },
);
