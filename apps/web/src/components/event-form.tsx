'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarClock, MapPin, Repeat, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { CustomEventWithStatus } from '@/lib/custom-events-repo';

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

type RecurrenceValue = (typeof RECURRENCE_OPTIONS)[number]['value'];

/** End-of-day epoch ms (local time) for a `YYYY-MM-DD` date input value. */
function endOfDayLocal(dateStr: string): number | null {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts as [number, number, number];
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export function CreateEventForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [when, setWhen] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceValue>('none');
  const [recurrenceEnd, setRecurrenceEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function reset() {
    setTitle('');
    setLocation('');
    setWhen('');
    setRecurrence('none');
    setRecurrenceEnd('');
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const startAt = when ? new Date(when).getTime() : NaN;
    if (!title.trim() || Number.isNaN(startAt)) {
      setError('Title and date & time are required.');
      return;
    }
    const recurrenceEndAt =
      recurrence !== 'none' && recurrenceEnd ? endOfDayLocal(recurrenceEnd) : null;

    startSaving(async () => {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          location: location.trim() || null,
          startAt,
          recurrence,
          recurrenceEndAt,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not create event.');
        return;
      }
      reset();
      router.refresh();
    });
  }

  return (
    <motion.form
      layout
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-lg border bg-[var(--color-card)] p-5 shadow-sm"
    >
      <div>
        <p className="text-sm font-medium">New event</p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Appears in your digest once its date falls within the lookahead window — sent by the same
          twice-daily alert.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="event-title">
          Title
        </label>
        <Input
          id="event-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Team offsite"
          maxLength={200}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="event-when">
            Date &amp; time
          </label>
          <Input
            id="event-when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="event-location">
            Location
          </label>
          <Input
            id="event-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Room 1, or a video link"
            maxLength={200}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="event-recurrence">
          Repeat
        </label>
        <select
          id="event-recurrence"
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value as RecurrenceValue)}
          className="h-10 rounded-md border bg-[var(--color-background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          {RECURRENCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {recurrence !== 'none' ? (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="event-recurrence-end">
            Repeat until <span className="text-[var(--color-muted-foreground)]">(optional)</span>
          </label>
          <Input
            id="event-recurrence-end"
            type="date"
            value={recurrenceEnd}
            onChange={(e) => setRecurrenceEnd(e.target.value)}
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-[var(--color-destructive)]">{error}</p> : null}

      <Button type="submit" disabled={saving} className="self-start">
        {saving ? 'Creating…' : 'Create event'}
      </Button>
    </motion.form>
  );
}

const STATUS_STYLES: Record<CustomEventWithStatus['status'], string> = {
  upcoming: 'text-[var(--color-primary)]',
  paused: 'text-[var(--color-muted-foreground)]',
  past: 'text-[var(--color-muted-foreground)]',
};

const STATUS_LABEL: Record<CustomEventWithStatus['status'], string> = {
  upcoming: 'Active',
  paused: 'Paused',
  past: 'Past',
};

function formatOccurrence(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

interface ListProps {
  events: CustomEventWithStatus[];
}

export function EventsList({ events }: ListProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function toggle(id: string, enabled: boolean) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No custom events yet. Create one above.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {events.map((ev) => (
          <motion.div
            key={ev.id}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-2 rounded-lg border bg-[var(--color-card)] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{ev.title}</p>
                <span className={cn('text-xs font-medium', STATUS_STYLES[ev.status])}>
                  {STATUS_LABEL[ev.status]}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
                <span className="flex items-center gap-1">
                  <CalendarClock className="size-3.5" aria-hidden />
                  {ev.status === 'upcoming' && ev.nextOccurrenceAt
                    ? formatOccurrence(ev.nextOccurrenceAt)
                    : formatOccurrence(ev.startAt)}
                </span>
                {ev.recurrence !== 'none' ? (
                  <span className="flex items-center gap-1 capitalize">
                    <Repeat className="size-3.5" aria-hidden />
                    {ev.recurrence}
                  </span>
                ) : null}
                {ev.location ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden />
                    {ev.location}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <Switch
                checked={ev.enabled}
                onCheckedChange={(next) => toggle(ev.id, next)}
                disabled={busyId === ev.id}
                aria-label={ev.enabled ? 'Pause event' : 'Resume event'}
              />
              <Button
                size="sm"
                variant={confirmDeleteId === ev.id ? 'destructive' : 'ghost'}
                onClick={() => remove(ev.id)}
                disabled={busyId === ev.id}
              >
                <Trash2 className="size-4" aria-hidden />
                {confirmDeleteId === ev.id ? 'Confirm' : ''}
              </Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
