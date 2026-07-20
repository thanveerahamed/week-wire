import { describe, it, expect } from 'vitest';
import { formatDigest, escapeMdV2 } from './digest.js';
import type { DigestEvent } from './schemas.js';

const TZ = 'Europe/Amsterdam';

describe('escapeMdV2', () => {
  it('escapes all MarkdownV2 specials', () => {
    expect(escapeMdV2('hello (world).')).toBe('hello \\(world\\)\\.');
    expect(escapeMdV2('a_b*c')).toBe('a\\_b\\*c');
  });
});

describe('formatDigest', () => {
  it('returns a friendly message when there are no events', () => {
    const out = formatDigest([], { timezone: TZ });
    expect(out).toContain('No events');
    expect(out).toContain('*WeekWire digest*');
  });

  it('groups events by local day in user timezone', () => {
    // 2026-06-03 23:30 UTC → 2026-06-04 01:30 Europe/Amsterdam (CEST = UTC+2)
    const events: DigestEvent[] = [
      {
        id: '1',
        calendarId: 'c1',
        accountEmail: 'a@example.com',
        title: 'Late meeting',
        location: null,
        start: '2026-06-03T23:30:00.000Z',
        end: '2026-06-04T00:00:00.000Z',
        allDay: false,
      },
      {
        id: '2',
        calendarId: 'c1',
        accountEmail: 'a@example.com',
        title: 'Morning standup',
        location: 'Room 1',
        start: '2026-06-03T07:00:00.000Z',
        end: '2026-06-03T07:30:00.000Z',
        allDay: false,
      },
    ];
    const out = formatDigest(events, { timezone: TZ, now: new Date('2026-06-03T00:00:00.000Z') });
    // Today (3 Jun) and Tomorrow (4 Jun) should be labeled as such, with dates.
    expect(out).toMatch(/Today, 3 Jun/);
    expect(out).toMatch(/Tomorrow, 4 Jun/);
    expect(out).toContain('Morning standup');
    expect(out).toContain('Late meeting');
    expect(out).toContain('Room 1');
  });

  it('renders all-day events with "all day" label', () => {
    const events: DigestEvent[] = [
      {
        id: '1',
        calendarId: 'c1',
        accountEmail: 'a@example.com',
        title: 'Holiday',
        location: null,
        start: '2026-06-05',
        end: '2026-06-06',
        allDay: true,
      },
    ];
    const out = formatDigest(events, {
      timezone: TZ,
      now: new Date('2026-06-05T00:00:00.000Z'),
    });
    expect(out).toContain('all day');
    expect(out).toContain('Holiday');
  });

  it('shows multi-day events once with an "until" suffix instead of repeating them', () => {
    const events: DigestEvent[] = [
      {
        id: '1',
        calendarId: 'c1',
        accountEmail: 'a@example.com',
        title: 'Summer camp',
        location: null,
        // All-day, spans 6 Jul through 31 Aug (end is exclusive per RFC5545).
        start: '2026-07-06',
        end: '2026-09-01',
        allDay: true,
      },
    ];
    const out = formatDigest(events, {
      timezone: TZ,
      now: new Date('2026-07-06T00:00:00.000Z'),
      lookaheadDays: 7,
    });
    // Only one occurrence — not repeated across the window.
    expect(out.match(/Summer camp/gu)).toHaveLength(1);
    expect(out).toContain('until 13 Jul'); // clipped to the 7-day lookahead window
  });

  it('escapes MarkdownV2 specials in titles and locations', () => {
    const events: DigestEvent[] = [
      {
        id: '1',
        calendarId: 'c1',
        accountEmail: 'a@example.com',
        title: '1:1 with (Alice)',
        location: 'Café_Foo',
        start: '2026-06-03T07:00:00.000Z',
        end: '2026-06-03T07:30:00.000Z',
        allDay: false,
      },
    ];
    const out = formatDigest(events, { timezone: TZ });
    expect(out).toContain('1:1 with \\(Alice\\)');
    expect(out).toContain('Café\\_Foo');
  });
});
