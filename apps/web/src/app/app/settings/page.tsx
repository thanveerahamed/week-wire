import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getUserPrefs } from '@/lib/prefs-repo';
import { getStatus } from '@/lib/telegram-repo';
import { DigestPreview, PreferencesForm } from '@/components/preferences-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const prefs = await getUserPrefs(session.uid);
  const telegram = await getStatus(session.uid);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Control your digest window and preview exactly what gets sent.
        </p>
      </header>

      <PreferencesForm initial={prefs} />
      <DigestPreview
        enabled={prefs.enabled}
        telegramLinked={telegram.chatLinked || telegram.channelLinked}
      />
    </div>
  );
}
