import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { nextCustomEventOccurrence, type CustomEventRecurrence } from '@week-wire/shared';
import type { CustomEventCreate, CustomEventUpdate } from '@week-wire/shared';
import { adminDb } from './firebase-admin';

export interface StoredCustomEvent {
  id: string;
  title: string;
  location: string | null;
  startAt: number;
  durationMinutes: number;
  recurrence: CustomEventRecurrence;
  recurrenceEndAt: number | null;
  enabled: boolean;
}

export type CustomEventStatus = 'upcoming' | 'paused' | 'past';

export interface CustomEventWithStatus extends StoredCustomEvent {
  nextOccurrenceAt: number | null;
  status: CustomEventStatus;
}

const DEFAULT_DURATION_MINUTES = 60;

function eventsCol(uid: string) {
  return adminDb().collection('users').doc(uid).collection('customEvents');
}

export async function createCustomEvent(uid: string, input: CustomEventCreate): Promise<string> {
  const ref = eventsCol(uid).doc();
  await ref.set({
    title: input.title,
    location: input.location ?? null,
    startAt: input.startAt,
    durationMinutes: input.durationMinutes ?? DEFAULT_DURATION_MINUTES,
    recurrence: input.recurrence,
    recurrenceEndAt: input.recurrenceEndAt ?? null,
    enabled: input.enabled ?? true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

function toStored(id: string, data: FirebaseFirestore.DocumentData): StoredCustomEvent {
  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    location: typeof data.location === 'string' ? data.location : null,
    startAt: typeof data.startAt === 'number' ? data.startAt : 0,
    durationMinutes:
      typeof data.durationMinutes === 'number' ? data.durationMinutes : DEFAULT_DURATION_MINUTES,
    recurrence:
      data.recurrence === 'daily' || data.recurrence === 'weekly' || data.recurrence === 'monthly'
        ? data.recurrence
        : 'none',
    recurrenceEndAt: typeof data.recurrenceEndAt === 'number' ? data.recurrenceEndAt : null,
    enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
  };
}

function withStatus(stored: StoredCustomEvent, now: number): CustomEventWithStatus {
  const next = stored.enabled ? nextCustomEventOccurrence(stored, now) : null;
  return {
    ...stored,
    nextOccurrenceAt: next?.start ?? null,
    status: !stored.enabled ? 'paused' : next ? 'upcoming' : 'past',
  };
}

/** List all of a user's custom events, annotated with active/upcoming status. */
export async function listCustomEvents(
  uid: string,
  now: number = Date.now(),
): Promise<CustomEventWithStatus[]> {
  const snap = await eventsCol(uid).orderBy('startAt', 'asc').get();
  const events = snap.docs.map((d) => withStatus(toStored(d.id, d.data()), now));

  const rank = (s: CustomEventStatus) => (s === 'upcoming' ? 0 : s === 'paused' ? 1 : 2);
  return events.sort((a, b) => {
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    if (a.status === 'upcoming') return (a.nextOccurrenceAt ?? 0) - (b.nextOccurrenceAt ?? 0);
    return b.startAt - a.startAt;
  });
}

export async function updateCustomEvent(
  uid: string,
  eventId: string,
  patch: CustomEventUpdate,
): Promise<void> {
  await eventsCol(uid)
    .doc(eventId)
    .set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function deleteCustomEvent(uid: string, eventId: string): Promise<void> {
  await eventsCol(uid).doc(eventId).delete();
}
