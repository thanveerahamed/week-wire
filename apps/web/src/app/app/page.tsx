import { getSession } from '@/lib/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarPlus, CalendarClock, Send, Settings2 } from 'lucide-react';
import Link from 'next/link';

export default async function AppHomePage() {
  const session = (await getSession())!;
  const first = (session.displayName ?? session.email).split(/[ @]/)[0];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Hi {first} — welcome.</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Three quick steps to get your first digest in Telegram.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/app/calendars" className="group">
          <Card className="h-full transition-transform group-hover:-translate-y-0.5 group-hover:shadow-md">
            <CardHeader>
              <CalendarPlus className="size-5 text-[var(--color-primary)]" aria-hidden />
              <CardTitle>Connect a Google Calendar</CardTitle>
              <CardDescription>Attach one or more Google accounts.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/app/telegram" className="group">
          <Card className="h-full transition-transform group-hover:-translate-y-0.5 group-hover:shadow-md">
            <CardHeader>
              <Send className="size-5 text-[var(--color-primary)]" aria-hidden />
              <CardTitle>Set up your Telegram bot</CardTitle>
              <CardDescription>Paste a bot token and link your chat.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/app/events" className="group">
          <Card className="h-full transition-transform group-hover:-translate-y-0.5 group-hover:shadow-md">
            <CardHeader>
              <CalendarClock className="size-5 text-[var(--color-primary)]" aria-hidden />
              <CardTitle>Add one-off or recurring events</CardTitle>
              <CardDescription>They ride along in the same digest — no new alert.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/app/settings" className="group sm:col-span-2">
          <Card className="h-full transition-transform group-hover:-translate-y-0.5 group-hover:shadow-md">
            <CardHeader>
              <Settings2 className="size-5 text-[var(--color-primary)]" aria-hidden />
              <CardTitle>Tune your preferences</CardTitle>
              <CardDescription>
                Lookahead window, notifications on/off, timezone (Europe/Amsterdam by default).
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Digests run at <strong>07:00</strong> and <strong>19:00</strong> Europe/Amsterdam.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
