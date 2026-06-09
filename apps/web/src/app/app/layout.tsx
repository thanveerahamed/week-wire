import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { SignOutButton } from '@/components/sign-out-button';
import { AppNav } from '@/components/app-nav';
import { PageTransition } from '@/components/page-transition';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-[var(--color-background)]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/app" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block size-3 rounded-full bg-[var(--color-primary)]" />
            WeekWire
          </Link>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-6 sm:pb-10">
        <PageTransition>{children}</PageTransition>
      </main>

      <AppNav />
    </div>
  );
}
