import { describe, it, expect } from 'vitest';
import { expandCustomEventOccurrences, nextCustomEventOccurrence } from './custom-events.js';
import type { CustomEventOccurrenceInput } from './custom-events.js';

describe('expandCustomEventOccurrences', () => {
  it('returns a single occurrence for a one-time event inside the window', () => {
    const event: CustomEventOccurrenceInput = {
      startAt: Date.UTC(2026, 6, 10, 9, 0),
      durationMinutes: 60,
      recurrence: 'none',
      recurrenceEndAt: null,
    };
    const out = expandCustomEventOccurrences(event, {
      from: Date.UTC(2026, 6, 1),
      to: Date.UTC(2026, 6, 20),
    });
    expect(out).toEqual([{ start: event.startAt, end: event.startAt + 60 * 60_000 }]);
  });

  it('excludes a one-time event outside the window', () => {
    const event: CustomEventOccurrenceInput = {
      startAt: Date.UTC(2026, 6, 25, 9, 0),
      durationMinutes: 30,
      recurrence: 'none',
      recurrenceEndAt: null,
    };
    const out = expandCustomEventOccurrences(event, {
      from: Date.UTC(2026, 6, 1),
      to: Date.UTC(2026, 6, 20),
    });
    expect(out).toEqual([]);
  });

  it('expands daily recurrence across the window', () => {
    const event: CustomEventOccurrenceInput = {
      startAt: Date.UTC(2026, 6, 1, 8, 0),
      durationMinutes: 15,
      recurrence: 'daily',
      recurrenceEndAt: null,
    };
    const out = expandCustomEventOccurrences(event, {
      from: Date.UTC(2026, 6, 5),
      to: Date.UTC(2026, 6, 8, 23, 59),
    });
    expect(out.map((o) => new Date(o.start).toISOString().slice(0, 10))).toEqual([
      '2026-07-05',
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
    ]);
  });

  it('stops expanding daily recurrence at recurrenceEndAt', () => {
    const event: CustomEventOccurrenceInput = {
      startAt: Date.UTC(2026, 6, 1, 8, 0),
      durationMinutes: 15,
      recurrence: 'daily',
      recurrenceEndAt: Date.UTC(2026, 6, 3, 23, 59),
    };
    const out = expandCustomEventOccurrences(event, {
      from: Date.UTC(2026, 6, 1),
      to: Date.UTC(2026, 6, 10),
    });
    expect(out).toHaveLength(3);
  });

  it('handles monthly recurrence with day-of-month clamping (Jan 31 -> Feb 28)', () => {
    const event: CustomEventOccurrenceInput = {
      startAt: Date.UTC(2026, 0, 31, 10, 0), // 2026-01-31
      durationMinutes: 30,
      recurrence: 'monthly',
      recurrenceEndAt: null,
    };
    const out = expandCustomEventOccurrences(event, {
      from: Date.UTC(2026, 0, 1),
      to: Date.UTC(2026, 3, 1),
    });
    const days = out.map((o) => new Date(o.start).toISOString().slice(0, 10));
    expect(days).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

describe('nextCustomEventOccurrence', () => {
  it('returns null for a past one-time event', () => {
    const event: CustomEventOccurrenceInput = {
      startAt: Date.UTC(2026, 0, 1),
      durationMinutes: 30,
      recurrence: 'none',
      recurrenceEndAt: null,
    };
    expect(nextCustomEventOccurrence(event, Date.UTC(2026, 6, 1))).toBeNull();
  });

  it('finds the next weekly occurrence after a given anchor', () => {
    const event: CustomEventOccurrenceInput = {
      startAt: Date.UTC(2026, 6, 1, 9, 0), // Wednesday
      durationMinutes: 60,
      recurrence: 'weekly',
      recurrenceEndAt: null,
    };
    const next = nextCustomEventOccurrence(event, Date.UTC(2026, 6, 10));
    expect(next?.start).toBe(Date.UTC(2026, 6, 15, 9, 0));
  });

  it('returns null once recurrence has ended', () => {
    const event: CustomEventOccurrenceInput = {
      startAt: Date.UTC(2026, 6, 1, 9, 0),
      durationMinutes: 60,
      recurrence: 'weekly',
      recurrenceEndAt: Date.UTC(2026, 6, 5),
    };
    expect(nextCustomEventOccurrence(event, Date.UTC(2026, 6, 10))).toBeNull();
  });
});
