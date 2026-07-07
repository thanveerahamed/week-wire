/**
 * Occurrence expansion for user-created custom events (as opposed to
 * Google Calendar events). A custom event has a single anchor start time
 * and an optional recurrence rule; these helpers turn that into concrete
 * occurrences for a given window, so they can be merged into the same
 * digest the existing cron dispatcher already sends.
 *
 * NOTE: recurrence stepping for 'daily'/'weekly' uses fixed millisecond
 * offsets from the anchor (not per-day local wall-clock recomputation), so
 * across a DST transition the local time-of-day can drift by an hour. This
 * is an accepted simplification for a lightweight reminder feature.
 */

export type CustomEventRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export interface CustomEventOccurrenceInput {
  /** Epoch ms of the first/anchor occurrence. */
  startAt: number;
  durationMinutes: number;
  recurrence: CustomEventRecurrence;
  /** Epoch ms cutoff (inclusive) for recurring events, or null for no end. */
  recurrenceEndAt: number | null;
}

export interface Occurrence {
  start: number;
  end: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Add `months` calendar months to a UTC timestamp, clamping day-of-month overflow. */
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
  // e.g. Jan 31 + 1 month would overflow into March; clamp to the last day
  // of the intended target month instead.
  if (next.getUTCDate() !== day) next.setUTCDate(0);
  return next.getTime();
}

function stepOccurrence(startAt: number, recurrence: CustomEventRecurrence, index: number): number {
  if (recurrence === 'daily') return startAt + index * DAY_MS;
  if (recurrence === 'weekly') return startAt + index * 7 * DAY_MS;
  return addMonthsUtc(startAt, index);
}

/**
 * Expand a (possibly recurring) custom event into concrete occurrences
 * falling within [from, to] (inclusive). Bounded by `maxIterations` as a
 * safety cap against unbounded loops for very old anchor dates.
 */
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

/**
 * Find the next occurrence at or after `from`, or null if the event has no
 * more occurrences (one-time event already past, or recurrence ended).
 */
export function nextCustomEventOccurrence(
  event: CustomEventOccurrenceInput,
  from: number,
  maxIterations = 3660,
): Occurrence | null {
  const { startAt, durationMinutes, recurrence, recurrenceEndAt } = event;
  const durationMs = Math.max(0, durationMinutes) * 60_000;

  if (recurrence === 'none') {
    if (startAt < from) return null;
    return { start: startAt, end: startAt + durationMs };
  }

  let index = 0;
  let occurrence = startAt;
  while (index < maxIterations) {
    if (recurrenceEndAt != null && occurrence > recurrenceEndAt) return null;
    if (occurrence >= from) return { start: occurrence, end: occurrence + durationMs };
    index++;
    occurrence = stepOccurrence(startAt, recurrence, index);
  }
  return null;
}
