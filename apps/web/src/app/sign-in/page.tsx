'use client';

import { Suspense, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { firebaseAuth, googleProvider } from '@/lib/firebase-client';

const POPUP_BLOCKED_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/cancelled-popup-request',
  'auth/web-storage-unsupported',
]);

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}

function SignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') ?? '/app';
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Complete a pending redirect sign-in (mobile Safari path).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getRedirectResult(firebaseAuth());
        if (cancelled || !result) return;
        const idToken = await result.user.getIdToken();
        await exchangeAndGo(idToken, from, router);
      } catch (err) {
        if (!cancelled) setError(messageFor(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, router]);

  function handleSignIn() {
    setError(null);
    startTransition(async () => {
      const auth = firebaseAuth();
      const provider = googleProvider();
      try {
        const result = await signInWithPopup(auth, provider);
        const idToken = await result.user.getIdToken();
        await exchangeAndGo(idToken, from, router);
      } catch (err) {
        const code = (err as { code?: string } | null)?.code ?? '';
        if (POPUP_BLOCKED_CODES.has(code)) {
          // Fallback for environments where popups don't work.
          await signInWithRedirect(auth, provider);
          return;
        }
        setError(messageFor(err));
      }
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Sign in to WeekWire</CardTitle>
            <CardDescription>
              Use your Google account. We only ask for your email and profile here — calendar
              access is granted later, per account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button size="lg" onClick={handleSignIn} disabled={pending}>
              {pending ? 'Signing in…' : 'Continue with Google'}
            </Button>
            {error ? (
              <p role="alert" className="text-sm text-[var(--color-destructive)]">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}

async function exchangeAndGo(
  idToken: string,
  from: string,
  router: ReturnType<typeof useRouter>,
) {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    throw new Error('Session exchange failed');
  }
  // Hard navigation so the middleware re-evaluates with the new cookie.
  window.location.assign(safeFrom(from));
}

function safeFrom(p: string): string {
  // Only allow same-origin internal paths.
  if (!p.startsWith('/') || p.startsWith('//')) return '/app';
  return p;
}

function messageFor(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'auth/popup-closed-by-user') return 'Sign-in window closed before completing.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection.';
  return 'Sign-in failed. Please try again.';
}

// Note: GoogleAuthProvider import kept above to ensure tree-shaking does not
// remove the provider registration before redirect fallback runs.
void GoogleAuthProvider;
