import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { listCustomEvents } from '@/lib/custom-events-repo';
import { CreateEventForm, EventsList } from '@/components/event-form';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const events = await listCustomEvents(session.uid);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Create one-time or recurring events. They ride along in the same digest as your calendars
          — no separate alert.
        </p>
      </header>

      <CreateEventForm />
      <EventsList events={events} />
    </div>
  );
}
