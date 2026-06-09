import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getStatus } from '@/lib/telegram-repo';
import { TelegramSetup } from '@/components/telegram-setup';

export const dynamic = 'force-dynamic';

export default async function TelegramPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const status = await getStatus(session.uid);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Telegram</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          You bring your own bot. WeekWire only talks to your bot — never anyone else&apos;s.
        </p>
      </header>

      <TelegramSetup status={status} />
    </div>
  );
}
