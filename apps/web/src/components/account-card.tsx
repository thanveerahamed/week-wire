'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Star, Trash2, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

export interface CalendarRow {
  calendarId: string;
  summary: string;
  primary: boolean;
  enabled: boolean;
}

interface Props {
  accountEmail: string;
  calendars: CalendarRow[];
}

export function AccountCard({ accountEmail, calendars }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [resyncing, startResyncing] = useTransition();
  const [resyncError, setResyncError] = useState<string | null>(null);

  async function toggle(calendarId: string, next: boolean) {
    setPendingId(calendarId);
    try {
      const res = await fetch(
        `/api/calendars/${encodeURIComponent(accountEmail)}/${encodeURIComponent(calendarId)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: next }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  function disconnect() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startRemoving(async () => {
      await fetch(`/api/calendars/${encodeURIComponent(accountEmail)}`, { method: 'DELETE' });
      router.refresh();
    });
  }

  function resync() {
    setResyncError(null);
    startResyncing(async () => {
      const res = await fetch(`/api/calendars/${encodeURIComponent(accountEmail)}/resync`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setResyncError(humanResyncError(data.error));
        return;
      }
      router.refresh();
    });
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg border bg-[var(--color-card)] text-[var(--color-card-foreground)] shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{accountEmail}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {calendars.length} calendar{calendars.length === 1 ? '' : 's'} •{' '}
            {calendars.filter((c) => c.enabled).length} enabled
          </p>
          {resyncError ? (
            <p role="alert" className="mt-1 text-xs text-[var(--color-destructive)]">
              {resyncError}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={resync} disabled={resyncing}>
            <RefreshCw className={`size-4 ${resyncing ? 'animate-spin' : ''}`} aria-hidden />
            {resyncing ? 'Syncing…' : 'Resync'}
          </Button>
          <Button
            variant={confirming ? 'destructive' : 'ghost'}
            size="sm"
            onClick={disconnect}
            disabled={removing}
          >
            <Trash2 className="size-4" aria-hidden />
            {confirming ? 'Confirm remove' : 'Remove'}
          </Button>
        </div>
      </div>

      <ul className="divide-y">
        {calendars.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
            No calendars discovered. Try reconnecting.
          </li>
        ) : (
          calendars.map((c) => (
            <li key={c.calendarId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                {c.primary ? (
                  <Star
                    className="size-3.5 shrink-0 text-[var(--color-primary)]"
                    fill="currentColor"
                    aria-label="Primary calendar"
                  />
                ) : null}
                <span className="truncate text-sm">{c.summary}</span>
              </div>
              <Switch
                checked={c.enabled}
                disabled={pendingId === c.calendarId}
                onCheckedChange={(next) => void toggle(c.calendarId, next)}
                aria-label={`Include ${c.summary} in digests`}
              />
            </li>
          ))
        )}
      </ul>
    </motion.div>
  );
}

function humanResyncError(code?: string): string {
  switch (code) {
    case 'needs_reauth':
      return 'Google needs you to reconnect this account.';
    case 'not_found':
      return 'This account is no longer connected.';
    case 'sync_failed':
      return 'Could not reach Google Calendar. Try again shortly.';
    default:
      return code ?? 'Something went wrong.';
  }
}
