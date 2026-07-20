/**
 * Vendored from @week-wire/shared so the Cloud Functions deploy artifact
 * stays self-contained (no workspace symlink resolution in production).
 * Keep these byte-identical with packages/shared/src.
 */
import { createDecipheriv } from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;

function loadKey(): Buffer {
  const raw = process.env.FIELD_ENC_KEY;
  if (!raw) throw new Error('FIELD_ENC_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LEN) {
    throw new Error(`FIELD_ENC_KEY must decode to ${KEY_LEN} bytes (got ${key.length})`);
  }
  return key;
}

export function decryptField(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) throw new Error('decryptField: malformed ciphertext payload');
  const [ivB64, tagB64, ctB64] = parts as [string, string, string];
  const key = loadKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  if (iv.length !== IV_LEN) throw new Error('decryptField: invalid IV length');
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

export interface DigestEvent {
  id: string;
  calendarId: string;
  accountEmail: string;
  title: string;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
}

const MD_V2_SPECIALS = /[_*[\]()~`>#+\-=|{}.!\\]/g;
function escapeMdV2(s: string): string {
  return s.replace(MD_V2_SPECIALS, (c) => `\\${c}`);
}

function localDateKey(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** Shift a YYYY-MM-DD key by `days` (may be negative), in plain calendar-day arithmetic. */
function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

function formatDayHeading(dateKey: string, timezone: string, todayKey?: string): string {
  if (todayKey) {
    if (dateKey === todayKey) return `Today, ${formatShortDate(dateKey, timezone)}`;
    if (dateKey === addDaysToKey(todayKey, 1)) return `Tomorrow, ${formatShortDate(dateKey, timezone)}`;
  }
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(anchor);
}

/** Short date label without weekday, e.g. "31 Aug" — used for "until …" suffixes. */
function formatShortDate(dateKey: string, timezone: string): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
  }).format(anchor);
}

/** Format "now" as a short date label (e.g. "Fri 4 Jul") in the given timezone. */
export function formatDigestDateLabel(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(now);
}

function formatTimeRange(ev: DigestEvent, timezone: string): string {
  if (ev.allDay) return 'all day';
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${fmt.format(new Date(ev.start))}–${fmt.format(new Date(ev.end))}`;
}

export function formatDigest(
  events: DigestEvent[],
  opts: { timezone: string; title?: string; now?: Date; lookaheadDays?: number },
): string {
  const { timezone, title = 'WeekWire digest', now = new Date(), lookaheadDays = 14 } = opts;
  const header = `*${escapeMdV2(title)}*`;
  if (events.length === 0) {
    return `${header}\n\n${escapeMdV2('No events in the lookahead window. Enjoy the quiet.')}`;
  }

  const windowStartKey = localDateKey(now.toISOString(), timezone);
  const windowEndKey = addDaysToKey(windowStartKey, lookaheadDays);

  // Multi-day events (e.g. subscribed webcal calendars) get a single entry —
  // placed on today if already in progress, otherwise on their start day —
  // annotated with an end date instead of being repeated on every day.
  const groups = new Map<string, DigestEvent[]>();
  const untilLabel = new Map<DigestEvent, string>();
  for (const ev of events) {
    const startKey = ev.allDay ? ev.start.slice(0, 10) : localDateKey(ev.start, timezone);
    // All-day end dates are exclusive per RFC5545 (day after the last day).
    const endKey = ev.allDay
      ? addDaysToKey(ev.end.slice(0, 10), -1)
      : localDateKey(ev.end, timezone);

    const placementKey = startKey > windowStartKey ? startKey : windowStartKey;
    if (placementKey > windowEndKey) continue; // fully outside the window

    if (endKey > startKey) {
      const clippedEndKey = endKey < windowEndKey ? endKey : windowEndKey;
      untilLabel.set(ev, formatShortDate(clippedEndKey, timezone));
    }

    const arr = groups.get(placementKey) ?? [];
    arr.push(ev);
    groups.set(placementKey, arr);
  }

  const sortedKeys = [...groups.keys()].sort();
  const sections = sortedKeys.map((key) => {
    const dayItems = (groups.get(key) ?? []).slice().sort((a, b) => a.start.localeCompare(b.start));
    const lines = dayItems.map((ev) => {
      const time = escapeMdV2(formatTimeRange(ev, timezone));
      const titleEsc = escapeMdV2(ev.title || '(untitled)');
      const loc = ev.location ? ` · ${escapeMdV2(ev.location)}` : '';
      const until = untilLabel.has(ev) ? ` ${escapeMdV2(`(until ${untilLabel.get(ev)})`)}` : '';
      return `• \`${time}\` ${titleEsc}${loc}${until}`;
    });
    return `*${escapeMdV2(formatDayHeading(key, timezone, windowStartKey))}*\n${lines.join('\n')}`;
  });
  return `${header}\n\n${sections.join('\n\n')}`;
}

/**
 * Occurrence expansion for user-created custom events. Fixed-ms stepping for
 * 'daily'/'weekly' (no per-day local wall-clock recomputation), so across a
 * DST transition the local time-of-day can drift by an hour — an accepted
 * simplification for a lightweight reminder feature.
 */
export type CustomEventRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export interface CustomEventOccurrenceInput {
  startAt: number;
  durationMinutes: number;
  recurrence: CustomEventRecurrence;
  recurrenceEndAt: number | null;
}

export interface Occurrence {
  start: number;
  end: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addMonthsUtc(ms: number, months: number): number {
  const d = new Date(ms);
  const day = d.getUTCDate();
  const next = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      day,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
  if (next.getUTCDate() !== day) next.setUTCDate(0);
  return next.getTime();
}

function stepOccurrence(startAt: number, recurrence: CustomEventRecurrence, index: number): number {
  if (recurrence === 'daily') return startAt + index * DAY_MS;
  if (recurrence === 'weekly') return startAt + index * 7 * DAY_MS;
  return addMonthsUtc(startAt, index);
}

export function expandCustomEventOccurrences(
  event: CustomEventOccurrenceInput,
  window: { from: number; to: number },
  maxIterations = 3660,
): Occurrence[] {
  const { startAt, durationMinutes, recurrence, recurrenceEndAt } = event;
  const { from, to } = window;
  const durationMs = Math.max(0, durationMinutes) * 60_000;
  const hardEnd = recurrenceEndAt != null ? Math.min(to, recurrenceEndAt) : to;
  if (hardEnd < from) return [];

  if (recurrence === 'none') {
    if (startAt < from || startAt > to) return [];
    return [{ start: startAt, end: startAt + durationMs }];
  }

  const out: Occurrence[] = [];
  let index = 0;
  let occurrence = startAt;
  while (occurrence <= hardEnd && index < maxIterations) {
    if (occurrence >= from) out.push({ start: occurrence, end: occurrence + durationMs });
    index++;
    occurrence = stepOccurrence(startAt, recurrence, index);
  }
  return out;
}
