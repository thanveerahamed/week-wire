'use client';

import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase-client';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      await Promise.allSettled([
        signOut(firebaseAuth()),
        fetch('/api/auth/session', { method: 'DELETE' }),
      ]);
    } finally {
      window.location.assign('/');
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      aria-label="Sign out"
    >
      <LogOut className="size-4" aria-hidden />
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}
