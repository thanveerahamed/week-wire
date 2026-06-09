'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Trash2,
  Send,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TelegramStatus } from '@/lib/telegram-repo';

interface Props {
  status: TelegramStatus;
}

export function TelegramSetup({ status }: Props) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, startRemoving] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startSaving(async () => {
      const res = await fetch('/api/telegram/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ botToken: token.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        description?: string;
      };
      if (!res.ok) {
        setError(data.description ?? humanError(data.error));
        return;
      }
      setToken('');
      router.refresh();
    });
  }

  function disconnect() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    startRemoving(async () => {
      await fetch('/api/telegram', { method: 'DELETE' });
      setConfirmRemove(false);
      router.refresh();
    });
  }

  const startUrl =
    status.botUsername && status.linkSecret
      ? `https://t.me/${status.botUsername}?start=${status.linkSecret}`
      : null;

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence mode="popLayout" initial={false}>
        {status.configured ? (
          <motion.div
            key="configured"
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-lg border bg-[var(--color-card)] p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Send className="size-4 text-[var(--color-primary)]" aria-hidden />
                  @{status.botUsername}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                  {status.chatLinked ? (
                    <>
                      <CheckCircle2
                        className="size-3.5 text-[var(--color-primary)]"
                        aria-hidden
                      />
                      Chat linked. You will receive digests.
                    </>
                  ) : (
                    <>
                      <AlertCircle
                        className="size-3.5 text-[var(--color-destructive)]"
                        aria-hidden
                      />
                      Bot is set up but no chat is linked yet.
                    </>
                  )}
                </p>
              </div>
              <Button
                variant={confirmRemove ? 'destructive' : 'ghost'}
                size="sm"
                onClick={disconnect}
                disabled={removing}
              >
                <Trash2 className="size-4" aria-hidden />
                {confirmRemove ? 'Confirm remove' : 'Disconnect'}
              </Button>
            </div>

            {!status.chatLinked && startUrl ? (
              <div className="mt-4 flex flex-col gap-2">
                <p className="text-sm">Open this link in Telegram to link your chat:</p>
                <div className="flex items-center gap-2">
                  <Input readOnly value={startUrl} className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void navigator.clipboard.writeText(startUrl)}
                    aria-label="Copy link"
                  >
                    <Copy className="size-4" aria-hidden />
                  </Button>
                </div>
                <Button asChild size="sm" className="self-start">
                  <a href={startUrl} target="_blank" rel="noreferrer">
                    Open in Telegram
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                </Button>
              </div>
            ) : null}
          </motion.div>
        ) : (
          <motion.form
            key="setup"
            layout
            onSubmit={submit}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-col gap-3 rounded-lg border bg-[var(--color-card)] p-4 shadow-sm"
          >
            <label className="text-sm font-medium" htmlFor="bot-token">
              Bot token
            </label>
            <Input
              id="bot-token"
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="123456789:AAAA…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Create a bot with{' '}
              <a
                className="underline"
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
              >
                @BotFather
              </a>{' '}
              and paste the token here. It is stored encrypted.
            </p>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={saving || token.trim().length < 20}>
                {saving ? 'Validating…' : 'Connect bot'}
              </Button>
              {error ? (
                <span role="alert" className="text-sm text-[var(--color-destructive)]">
                  {error}
                </span>
              ) : null}
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function humanError(code?: string): string {
  switch (code) {
    case 'invalid_token':
      return 'Telegram rejected this token.';
    case 'not_a_bot':
      return 'That token does not belong to a bot.';
    case 'webhook_failed':
      return 'Could not register the webhook. Check your public URL.';
    case 'unauthorized':
      return 'Please sign in again.';
    default:
      return code ?? 'Something went wrong.';
  }
}
