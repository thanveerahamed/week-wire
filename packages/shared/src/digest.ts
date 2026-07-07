import type { DigestEvent } from './schemas.js';

/**
 * Format a Telegram MarkdownV2 digest from a list of events for a given user
 * timezone. Events are grouped by local day in the user's timezone.
 *
 * NOTE: Telegram MarkdownV2 requires escaping for these characters:
 *   _*[]()~`>#+-=|{}.!\
 */

const MD_V2_SPECIALS = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMdV2(s: string): string {
  return s.replace(MD_V2_SPECIALS, (c) => `\\${c}`);
}

interface FormatOptions {
  timezone: string;
  /** Header shown above the digest. */
  title?: string;
  /** Optional "now" override for deterministic tests. */
  now?: Date;
  /**
   * Size of the lookahead window in days, used to cap how far multi-day
   * events are repeated across days. Defaults to 14 (the max user setting).
   */
  lookaheadDays?: number;
}

/** Group events by ISO local date (YYYY-MM-DD) in the given timezone. */
function localDateKey(iso: string, timezone: string): string {
  const d = new Date(iso);
  // Use sv-SE for ISO-ish YYYY-MM-DD.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Shift a YYYY-MM-DD key by `days` (may be negative), in plain calendar-day arithmetic. */
function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

function formatDayHeading(dateKey: string, timezone: string): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  // Anchor at noon UTC to avoid TZ flipping the date.
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

export function formatDigest(events: DigestEvent[], opts: FormatOptions): string {
  const { timezone, title = 'WeekWire digest', now = new Date(), lookaheadDays = 14 } = opts;

  const header = `*${escapeMdV2(title)}*`;

  if (events.length === 0) {
    return `${header}\n\n${escapeMdV2('No events in the lookahead window. Enjoy the quiet.')}`;
  }

  const windowStartKey = localDateKey(now.toISOString(), timezone);
  const windowEndKey = addDaysToKey(windowStartKey, lookaheadDays);

  // Group by local date. Multi-day events (spanning events, e.g. subscribed
  // webcal calendars) get a single entry — placed on today if already in
  // progress, otherwise on their start day — annotated with an end date
  // instead of being repeated on every day they overlap.
  const groups = new Map<string, DigestEvent[]>();
  const untilLabel = new Map<DigestEvent, string>();
  for (const ev of events) {
    const startKey = ev.allDay
      ? ev.start.slice(0, 10) // all-day events already have date-only start
      : localDateKey(ev.start, timezone);
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
    return `*${escapeMdV2(formatDayHeading(key, timezone))}*\n${lines.join('\n')}`;
  });

  return `${header}\n\n${sections.join('\n\n')}`;
}
