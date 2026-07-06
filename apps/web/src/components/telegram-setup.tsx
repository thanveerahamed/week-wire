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
  Radio,
  Users,
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

  const [channelId, setChannelId] = useState('');
  const [channelError, setChannelError] = useState<string | null>(null);
  const [linkingChannel, startLinkingChannel] = useTransition();
  const [unlinkingChannel, startUnlinkingChannel] = useTransition();

  const [groupId, setGroupId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [groupError, setGroupError] = useState<string | null>(null);
  const [linkingGroup, startLinkingGroup] = useTransition();
  const [unlinkingGroup, startUnlinkingGroup] = useTransition();

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

  function linkChannelSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChannelError(null);
    startLinkingChannel(async () => {
      const res = await fetch('/api/telegram/channel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelId: channelId.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        description?: string;
      };
      if (!res.ok) {
        setChannelError(data.description ?? humanChannelError(data.error));
        return;
      }
      setChannelId('');
      router.refresh();
    });
  }

  function unlinkChannel() {
    startUnlinkingChannel(async () => {
      await fetch('/api/telegram/channel', { method: 'DELETE' });
      router.refresh();
    });
  }

  function linkGroupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGroupError(null);
    startLinkingGroup(async () => {
      const res = await fetch('/api/telegram/group', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ groupId: groupId.trim(), topicId: topicId.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        description?: string;
      };
      if (!res.ok) {
        setGroupError(data.description ?? humanGroupError(data.error));
        return;
      }
      setGroupId('');
      setTopicId('');
      router.refresh();
    });
  }

  function unlinkGroup() {
    startUnlinkingGroup(async () => {
      await fetch('/api/telegram/group', { method: 'DELETE' });
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
                  <Send className="size-4 text-[var(--color-primary)]" aria-hidden />@
                  {status.botUsername}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                  {status.chatLinked ? (
                    <>
                      <CheckCircle2 className="size-3.5 text-[var(--color-primary)]" aria-hidden />
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

            <hr className="mt-4 border-t" />

            <div className="mt-4 flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Radio className="size-4 text-[var(--color-primary)]" aria-hidden />
                Channel
              </p>
              {status.channelLinked ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                    <CheckCircle2 className="size-3.5 text-[var(--color-primary)]" aria-hidden />
                    Posting digests to{' '}
                    {status.channelUsername ? `@${status.channelUsername}` : status.channelTitle}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={unlinkChannel}
                    disabled={unlinkingChannel}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Unlink
                  </Button>
                </div>
              ) : (
                <form onSubmit={linkChannelSubmit} className="flex flex-col gap-2">
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Add @{status.botUsername} as an admin of a channel, then paste its @username or
                    numeric id below to also post digests there.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="@my_channel or -1001234567890"
                      value={channelId}
                      onChange={(e) => setChannelId(e.target.value)}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <Button type="submit" size="sm" disabled={linkingChannel || !channelId.trim()}>
                      {linkingChannel ? 'Linking…' : 'Link'}
                    </Button>
                  </div>
                  {channelError ? (
                    <span role="alert" className="text-sm text-[var(--color-destructive)]">
                      {channelError}
                    </span>
                  ) : null}
                </form>
              )}
            </div>

            <hr className="mt-4 border-t" />

            <div className="mt-4 flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Users className="size-4 text-[var(--color-primary)]" aria-hidden />
                Group topic
              </p>
              {status.groupLinked ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                    <CheckCircle2 className="size-3.5 text-[var(--color-primary)]" aria-hidden />
                    Posting digests to {status.groupTitle ?? 'the linked group'}
                    {status.groupTopicId != null ? ` (topic #${status.groupTopicId})` : ''}
                  </p>
                  <Button variant="ghost" size="sm" onClick={unlinkGroup} disabled={unlinkingGroup}>
                    <Trash2 className="size-4" aria-hidden />
                    Unlink
                  </Button>
                </div>
              ) : (
                <form onSubmit={linkGroupSubmit} className="flex flex-col gap-2">
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Add @{status.botUsername} to a supergroup with Topics enabled, paste its numeric
                    id (e.g. -1001234567890) and the topic&apos;s thread id. Leave the topic id
                    empty to post to the group&apos;s General topic.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="-1001234567890"
                      value={groupId}
                      onChange={(e) => setGroupId(e.target.value)}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <Input
                      placeholder="Topic id (optional)"
                      value={topicId}
                      onChange={(e) => setTopicId(e.target.value)}
                      spellCheck={false}
                      autoComplete="off"
                      className="max-w-40"
                    />
                    <Button type="submit" size="sm" disabled={linkingGroup || !groupId.trim()}>
                      {linkingGroup ? 'Linking…' : 'Link'}
                    </Button>
                  </div>
                  {groupError ? (
                    <span role="alert" className="text-sm text-[var(--color-destructive)]">
                      {groupError}
                    </span>
                  ) : null}
                </form>
              )}
            </div>
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

function humanChannelError(code?: string): string {
  switch (code) {
    case 'bot_not_configured':
      return 'Connect a bot above first.';
    case 'channel_not_found':
      return 'Telegram could not find that channel.';
    case 'not_a_channel':
      return 'That id is not a channel.';
    case 'bot_not_admin':
      return 'Add the bot as an admin of the channel first.';
    case 'unauthorized':
      return 'Please sign in again.';
    default:
      return code ?? 'Something went wrong.';
  }
}

function humanGroupError(code?: string): string {
  switch (code) {
    case 'bot_not_configured':
      return 'Connect a bot above first.';
    case 'group_not_found':
      return 'Telegram could not find that group.';
    case 'not_a_supergroup':
      return 'That id is not a supergroup. Upgrade it and enable Topics first.';
    case 'topics_not_enabled':
      return 'Topics are not enabled for that group.';
    case 'bot_not_member':
      return 'Add the bot to the group first.';
    case 'unauthorized':
      return 'Please sign in again.';
    default:
      return code ?? 'Something went wrong.';
  }
}
