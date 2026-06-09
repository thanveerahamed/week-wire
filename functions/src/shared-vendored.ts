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

function formatDayHeading(dateKey: string, timezone: string): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
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

export function formatDigest(
  events: DigestEvent[],
  opts: { timezone: string; title?: string },
): string {
  const { timezone, title = 'WeekWire digest' } = opts;
  const header = `*${escapeMdV2(title)}*`;
  if (events.length === 0) {
    return `${header}\n\n${escapeMdV2('No events in the lookahead window. Enjoy the quiet.')}`;
  }
  const groups = new Map<string, DigestEvent[]>();
  for (const ev of events) {
    const key = ev.allDay ? ev.start.slice(0, 10) : localDateKey(ev.start, timezone);
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
