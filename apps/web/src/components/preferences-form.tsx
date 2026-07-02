'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import type { UserPrefs } from '@/lib/prefs-repo';

interface Props {
  initial: UserPrefs;
}

const COMMON_TIMEZONES = [
  'Europe/Amsterdam',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Stockholm',
  'Europe/Helsinki',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
  'UTC',
] as const;

export function PreferencesForm({ initial }: Props) {
  const [lookaheadDays, setLookaheadDays] = useState(initial.lookaheadDays);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skipFirst = useRef(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced auto-save when any pref changes.
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void save({ lookaheadDays, enabled, timezone });
    }, 400);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookaheadDays, enabled, timezone]);

  async function save(patch: Partial<UserPrefs>) {
    setError(null);
    const res = await fetch('/api/prefs', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Could not save preferences.');
      return;
    }
    setSavedAt(Date.now());
  }

  return (
    <motion.div
      layout
      className="flex flex-col gap-6 rounded-lg border bg-[var(--color-card)] p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Notifications</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Pause to stop the twice-daily digest without disconnecting anything.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Enable digest notifications"
        />
      </div>

      <hr className="border-t" />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <label className="text-sm font-medium" htmlFor="lookahead">
            Lookahead window
          </label>
          <span className="text-sm tabular-nums">
            {lookaheadDays} day{lookaheadDays === 1 ? '' : 's'}
          </span>
        </div>
        <Slider
          id="lookahead"
          min={1}
          max={14}
          step={1}
          value={[lookaheadDays]}
          onValueChange={(v) => {
            const n = v[0];
            if (typeof n === 'number') setLookaheadDays(n);
          }}
          disabled={!enabled}
        />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          How far ahead each digest looks. 1–14 days.
        </p>
      </div>

      <hr className="border-t" />

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="timezone">
          Timezone
        </label>
        <Input
          id="timezone"
          list="tz-list"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="Europe/Amsterdam"
          spellCheck={false}
          autoComplete="off"
        />
        <datalist id="tz-list">
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          IANA name (e.g. <code>Europe/Amsterdam</code>). Digest send times stay at 07:00 / 19:00
          Europe/Amsterdam — this only formats events.
        </p>
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)]">
        <span aria-live="polite">
          {error ? (
            <span className="text-[var(--color-destructive)]">{error}</span>
          ) : savedAt ? (
            <>Saved</>
          ) : (
            <>&nbsp;</>
          )}
        </span>
      </div>
    </motion.div>
  );
}

interface PreviewProps {
  enabled: boolean;
  telegramLinked: boolean;
}

export function DigestPreview({ enabled, telegramLinked }: PreviewProps) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [sendResult, setSendResult] = useState<'ok' | 'error' | null>(null);
  const [sending, startSending] = useTransition();

  function load() {
    setError(null);
    startLoading(async () => {
      const res = await fetch('/api/digest/preview');
      const data = (await res.json().catch(() => ({}))) as {
        markdown?: string;
        eventCount?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Could not load preview.');
        return;
      }
      setMarkdown(data.markdown ?? '');
      setEventCount(data.eventCount ?? 0);
    });
  }

  function sendToTelegram() {
    setSendResult(null);
    startSending(async () => {
      const res = await fetch('/api/telegram/send-preview', { method: 'POST' });
      setSendResult(res.ok ? 'ok' : 'error');
    });
  }

  return (
    <motion.div
      layout
      className="flex flex-col gap-3 rounded-lg border bg-[var(--color-card)] p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Send className="size-4 text-[var(--color-primary)]" aria-hidden />
          <p className="text-sm font-medium">Digest preview</p>
        </div>
        <div className="flex items-center gap-2">
          {telegramLinked ? (
            <Button
              size="sm"
              variant="outline"
              onClick={sendToTelegram}
              disabled={sending || !enabled}
            >
              <Send className="size-4" aria-hidden />
              {sending ? 'Sending…' : 'Send to Telegram'}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={load} disabled={loading || !enabled}>
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            {markdown == null ? 'Generate' : 'Refresh'}
          </Button>
        </div>
      </div>

      {!enabled ? (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Notifications are paused. Re-enable to preview.
        </p>
      ) : null}

      {telegramLinked && sendResult ? (
        <p
          className={
            sendResult === 'ok'
              ? 'text-sm text-[var(--color-primary)]'
              : 'text-sm text-[var(--color-destructive)]'
          }
          role="status"
        >
          {sendResult === 'ok' ? 'Sent! Check Telegram.' : 'Could not send to Telegram.'}
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-[var(--color-destructive)]" role="alert">
          {error}
        </p>
      ) : null}

      {markdown != null ? (
        <>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {eventCount} event{eventCount === 1 ? '' : 's'} in window. Raw MarkdownV2 below — this
            is exactly what your bot will send.
          </p>
          <pre className="bg-[var(--color-muted)]/40 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border p-3 text-xs leading-relaxed">
            {markdown}
          </pre>
        </>
      ) : null}
    </motion.div>
  );
}
