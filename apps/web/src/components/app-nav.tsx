'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Home, CalendarDays, Send, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
}

const items: readonly NavItem[] = [
  { href: '/app', label: 'Home', icon: Home, exact: true },
  { href: '/app/calendars', label: 'Calendars', icon: CalendarDays },
  { href: '/app/telegram', label: 'Telegram', icon: Send },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-[var(--color-background)]/90 backdrop-blur sm:hidden"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="relative">
              <Link
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 py-2.5 text-xs transition-colors',
                  active
                    ? 'text-[var(--color-primary)]'
                    : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span>{item.label}</span>
                {active ? (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-[var(--color-primary)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
