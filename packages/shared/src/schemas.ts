import { z } from 'zod';

/** IANA timezone, validated at the boundary. */
export const TimezoneSchema = z
  .string()
  .min(1)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid IANA timezone' },
  );

export const UserPrefsSchema = z.object({
  displayName: z.string().max(200).nullable(),
  email: z.string().email(),
  photoURL: z.string().url().nullable(),
  lookaheadDays: z.number().int().min(1).max(14),
  timezone: TimezoneSchema,
  enabled: z.boolean(),
});

export type UserPrefs = z.infer<typeof UserPrefsSchema>;

/** Update payload — only mutable preference fields. */
export const UserPrefsUpdateSchema = UserPrefsSchema.pick({
  lookaheadDays: true,
  timezone: true,
  enabled: true,
}).partial();

export type UserPrefsUpdate = z.infer<typeof UserPrefsUpdateSchema>;

/** Stored on `users/{uid}/calendarAccounts/{accountEmail}`. */
export const CalendarAccountSchema = z.object({
  accountEmail: z.string().email(),
  refreshTokenEnc: z.string().min(1),
  scopes: z.array(z.string()),
  needsReauth: z.boolean(),
  connectedAt: z.number().int().nonnegative(),
});

export type CalendarAccount = z.infer<typeof CalendarAccountSchema>;

/** Stored on `users/{uid}/calendarAccounts/{accountEmail}/calendars/{calendarId}`. */
export const SubCalendarSchema = z.object({
  calendarId: z.string().min(1),
  summary: z.string(),
  primary: z.boolean(),
  enabled: z.boolean(),
  colorId: z.string().nullable(),
});

export type SubCalendar = z.infer<typeof SubCalendarSchema>;

/** Stored on `users/{uid}/telegram/config`. */
export const TelegramConfigSchema = z.object({
  botTokenEnc: z.string().min(1),
  botUsername: z.string().min(1),
  chatId: z.number().int().nullable(),
  linkSecret: z.string().min(16),
  webhookSetAt: z.number().int().nullable(),
});

export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;

/** A Telegram bot token, validated by shape only (real check is `getMe`). */
export const TelegramBotTokenSchema = z
  .string()
  .regex(/^\d{6,12}:[A-Za-z0-9_-]{30,}$/u, 'Not a valid Telegram bot token shape');

export const CustomEventRecurrenceSchema = z.enum(['none', 'daily', 'weekly', 'monthly']);

/** Stored on `users/{uid}/customEvents/{eventId}`. */
export const CustomEventSchema = z.object({
  title: z.string().min(1).max(200),
  location: z.string().max(200).nullable(),
  startAt: z.number().int(),
  durationMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  recurrence: CustomEventRecurrenceSchema,
  recurrenceEndAt: z.number().int().nullable(),
  enabled: z.boolean(),
});

export type CustomEvent = z.infer<typeof CustomEventSchema>;

/** Create payload — server fills in defaults for omitted optional fields. */
export const CustomEventCreateSchema = z.object({
  title: z.string().min(1).max(200),
  location: z.string().max(200).nullable().optional(),
  startAt: z.number().int(),
  durationMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .optional(),
  recurrence: CustomEventRecurrenceSchema,
  recurrenceEndAt: z.number().int().nullable().optional(),
  enabled: z.boolean().optional(),
});

export type CustomEventCreate = z.infer<typeof CustomEventCreateSchema>;

/** Update payload — only mutable fields, all optional. */
export const CustomEventUpdateSchema = CustomEventSchema.partial();

export type CustomEventUpdate = z.infer<typeof CustomEventUpdateSchema>;

/** A Google calendar event projected for digest rendering. */
export const DigestEventSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  accountEmail: z.string().email(),
  title: z.string(),
  location: z.string().nullable(),
  start: z.string(), // ISO
  end: z.string(), // ISO
  allDay: z.boolean(),
});

export type DigestEvent = z.infer<typeof DigestEventSchema>;
