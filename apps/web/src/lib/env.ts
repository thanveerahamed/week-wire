/**
 * Server-side env validation. Import only from server code (Route Handlers,
 * Server Components, Server Actions). Throws at boot if required secrets are
 * missing in production.
 */
import { z } from 'zod';

const ServerEnvSchema = z.object({
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
  FIELD_ENC_KEY: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(16),
  SESSION_COOKIE_NAME: z.string().min(1).default('__wwsession'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
});

let cached: z.infer<typeof ServerEnvSchema> | null = null;

export function serverEnv(): z.infer<typeof ServerEnvSchema> {
  if (cached) return cached;
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // In dev we want a clear message; in prod we hard-fail.
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server env: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
