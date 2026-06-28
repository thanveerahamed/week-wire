import { redirect } from 'next/navigation';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { getSession } from '@/lib/session';
import { listCalendarAccounts, listSubCalendars } from '@/lib/calendars-repo';
import { AccountCard, type CalendarRow } from '@/components/account-card';
import { ConnectCalendarButton } from '@/components/connect-calendar-button';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ connected?: string; error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_code_or_state: 'OAuth response was incomplete. Please try again.',
  bad_state: 'The OAuth flow expired or was tampered with. Please retry.',
  exchange_failed: 'Google rejected the authorization code. Please retry.',
  no_refresh_token:
    'Google did not return a refresh token. Revoke WeekWire in your Google Account and try again.',
  userinfo_failed: "We couldn't read your Google account email. Please retry.",
  persist_failed: 'Something went wrong saving your calendars. Please retry.',
  access_denied: 'You declined the permission request.',
};

export default async function CalendarsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const { connected, error } = await searchParams;

  const accounts = await listCalendarAccounts(session.uid);
  const calendarsByAccount = await Promise.all(
    accounts.map(async (a) => ({
      accountEmail: a.accountEmail,
      calendars: (await listSubCalendars(session.uid, a.accountEmail)).map<CalendarRow>((c) => ({
        calendarId: c.calendarId,
        summary: c.summary,
        primary: c.primary,
        enabled: c.enabled,
      })),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Connect one or more Google accounts and pick which calendars appear in your digest.
          </p>
        </div>
        <ConnectCalendarButton />
      </header>

      {connected ? (
        <div className="flex items-center gap-2 rounded-md border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-3 py-2 text-sm">
          <CheckCircle2 className="size-4 text-[var(--color-primary)]" aria-hidden />
          Connected <span className="font-medium">{connected}</span>.
        </div>
      ) : null}
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm">
          <AlertCircle className="mt-0.5 size-4 text-[var(--color-destructive)]" aria-hidden />
          <span>{ERROR_MESSAGES[error] ?? `Connection failed (${error}).`}</span>
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            No Google accounts connected yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {calendarsByAccount.map((a) => (
            <AccountCard
              key={a.accountEmail}
              accountEmail={a.accountEmail}
              calendars={a.calendars}
            />
          ))}
        </div>
      )}
    </div>
  );
}
