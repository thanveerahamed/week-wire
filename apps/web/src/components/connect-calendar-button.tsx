'use client';

import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConnectCalendarButton() {
  function handleClick() {
    // Pass the browser's origin so the server can build the exact redirect URI
    // for this environment without any hardcoded config. The start route
    // validates the origin against an allowlist before using it.
    const origin = encodeURIComponent(window.location.origin);
    window.location.href = `/api/google/oauth/start?origin=${origin}`;
  }

  return (
    <Button onClick={handleClick}>
      <CalendarPlus className="size-4" aria-hidden />
      Connect Google Calendar
    </Button>
  );
}
