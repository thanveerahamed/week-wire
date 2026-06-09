import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarClock, Bell, Shield } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-12 px-6 py-12 sm:py-20">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-full bg-[var(--color-primary)]" />
          <span className="font-semibold tracking-tight">WeekWire</span>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </header>

      <section className="flex flex-col gap-6 text-center sm:gap-8">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
          Your week, wired to Telegram.
        </h1>
        <p className="mx-auto max-w-2xl text-pretty text-base text-[var(--color-muted-foreground)] sm:text-lg">
          Connect your Google Calendars, link your Telegram bot, and receive a clean digest of
          what&apos;s coming up — every morning at 7 and every evening at 7, Europe/Amsterdam.
        </p>
        <div className="flex justify-center">
          <Button asChild size="lg">
            <Link href="/sign-in">Get started</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CalendarClock className="size-5 text-[var(--color-primary)]" aria-hidden />
            <CardTitle>Multiple calendars</CardTitle>
            <CardDescription>
              Attach as many Google accounts as you like and pick the calendars that matter.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <Bell className="size-5 text-[var(--color-primary)]" aria-hidden />
            <CardTitle>Bring your own bot</CardTitle>
            <CardDescription>
              Use your own Telegram bot. We never read or send messages outside your chat.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <Shield className="size-5 text-[var(--color-primary)]" aria-hidden />
            <CardTitle>Encrypted by default</CardTitle>
            <CardDescription>
              Tokens are AES-256-GCM encrypted before they touch our database.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <footer className="mt-auto pt-12 text-center text-xs text-[var(--color-muted-foreground)]">
        Hosted on Firebase, europe-west1.
      </footer>
    </main>
  );
}
