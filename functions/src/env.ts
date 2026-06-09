/**
 * Server env required by the digest job. Validated once at module load to
 * fail fast on misconfiguration.
 */
import { z } from 'zod';

const Schema = z.object({
  FIELD_ENC_KEY: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  // The collector only uses refresh tokens; the redirect URI is never invoked
  // from the worker. googleapis only requires it for the auth-code flow, so
  // we keep it optional and fall back to a sentinel value.
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),
  GCP_PROJECT: z.string().min(1).optional(),
});

let cached: z.infer<typeof Schema> | null = null;

export function env(): z.infer<typeof Schema> {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid functions env: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
