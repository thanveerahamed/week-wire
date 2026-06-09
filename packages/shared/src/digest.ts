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
  const { timezone, title = 'WeekWire digest' } = opts;

  const header = `*${escapeMdV2(title)}*`;

  if (events.length === 0) {
    return `${header}\n\n${escapeMdV2('No events in the lookahead window. Enjoy the quiet.')}`;
  }

  // Group by local date.
  const groups = new Map<string, DigestEvent[]>();
  for (const ev of events) {
    const key = ev.allDay
      ? ev.start.slice(0, 10) // all-day events already have date-only start
      : localDateKey(ev.start, timezone);
    const arr = groups.get(key) ?? [];
    arr.push(ev);
    groups.set(key, arr);
  }

  const sortedKeys = [...groups.keys()].sort();

  const sections = sortedKeys.map((key) => {
    const dayItems = (groups.get(key) ?? []).slice().sort((a, b) => a.start.localeCompare(b.start));
    const lines = dayItems.map((ev) => {
      const time = escapeMdV2(formatTimeRange(ev, timezone));
      const titleEsc = escapeMdV2(ev.title || '(untitled)');
      const loc = ev.location ? ` · ${escapeMdV2(ev.location)}` : '';
      return `• \`${time}\` ${titleEsc}${loc}`;
    });
    return `*${escapeMdV2(formatDayHeading(key, timezone))}*\n${lines.join('\n')}`;
  });

  return `${header}\n\n${sections.join('\n\n')}`;
}
