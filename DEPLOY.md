# week-wire — Deploy & Verify (Phase 7)

Project id: **`week-wire`** • Region: **`europe-west1`**

`.firebaserc` pins the project so every `firebase` command without `--project`
also targets `week-wire`. `gcloud` commands below pass `--project=week-wire`
explicitly so they're safe to copy regardless of your active config.

## 0. One-time prerequisites

```bash
gcloud auth login
gcloud config set project week-wire
firebase login
firebase use week-wire

# Enable required APIs
gcloud services enable \
  --project=week-wire \
  run.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  eventarc.googleapis.com \
  artifactregistry.googleapis.com
```

## 1. Firestore

```bash
# (Once) Provision Firestore in europe-west1
gcloud firestore databases create --location=europe-west1 --project=week-wire

# Deploy rules + indexes (composite on users.enabled+updatedAt, TTL on runs.expiresAt)
pnpm deploy:rules
```

Wait for the TTL on `runs.expiresAt` to show **Enabled** in the Firestore
console (can take a few minutes).

## 2. Secrets (Secret Manager)

```bash
# 32-byte AES-256-GCM key
openssl rand -base64 32 | \
  gcloud secrets create FIELD_ENC_KEY --data-file=- --project=week-wire

# 32-byte HMAC secret (Google-OAuth state + Telegram webhook secret derivation)
openssl rand -hex 32 | tr -d '\n' | \
  gcloud secrets create WEBHOOK_SECRET --data-file=- --project=week-wire

# Google OAuth client (Calendar offline access — separate from Firebase Auth)
printf '%s' "$GOOGLE_OAUTH_CLIENT_ID"     | \
  gcloud secrets create GOOGLE_OAUTH_CLIENT_ID     --data-file=- --project=week-wire
printf '%s' "$GOOGLE_OAUTH_CLIENT_SECRET" | \
  gcloud secrets create GOOGLE_OAUTH_CLIENT_SECRET --data-file=- --project=week-wire
```

Grant the Functions runtime SA read access to the secrets it needs:

```bash
PROJECT_NUMBER=$(gcloud projects describe week-wire --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in FIELD_ENC_KEY GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --project=week-wire \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

App Hosting reads `WEBHOOK_SECRET` + `GOOGLE_OAUTH_*` + `FIELD_ENC_KEY` from
`apphosting.yaml`; first deploy will prompt for IAM grants if missing.

## 3. Pub/Sub topic

```bash
gcloud pubsub topics create digest-user --project=week-wire
```

The worker subscription is auto-created by the Functions deploy. The scheduler
publishes to an internal Firebase-managed topic for the cron trigger.

## 4. Cloud Functions

```bash
pnpm deploy:functions
```

Deploys:

- **`dispatchDigests`** — Cloud Scheduler job
  `firebase-schedule-dispatchDigests-europe-west1`, cron `0 7,19 * * *`,
  TZ `Europe/Amsterdam`.
- **`sendUserDigest`** — Pub/Sub-triggered on `digest-user`, retry on,
  bound to secrets `FIELD_ENC_KEY` + `GOOGLE_OAUTH_CLIENT_ID` +
  `GOOGLE_OAUTH_CLIENT_SECRET`.

## 5. App Hosting (Next.js web)

```bash
firebase apphosting:backends:create --location=europe-west1 --project=week-wire
# Pick GitHub repo + branch when prompted. Subsequent rollouts:
pnpm deploy:hosting
firebase apphosting:backends:list --project=week-wire
```

Note the production URL it returns (e.g. `https://week-wire--<hash>.europe-west1.hosted.app`).
Then:

1. **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client**
   Add authorized redirect URI: `https://<APP_HOST>/api/google/oauth/callback`
2. **Firebase Console → Authentication → Settings → Authorized domains**
   Add `<APP_HOST>`.
3. Set `NEXT_PUBLIC_APP_URL` in `apphosting.yaml` to `https://<APP_HOST>` and
   redeploy: `pnpm deploy:hosting`.

## 6. Verification

### a. Web sign-in & calendar link

1. Open `https://<APP_HOST>`, sign in with Google.
2. `/app/calendars` → Connect → enable a sub-calendar.
3. `/app/telegram` → paste bot token from @BotFather → `/start` link.
4. `/app/settings` → **Generate preview** → MarkdownV2 list renders.

### b. Worker dry-run

```bash
UID="<your-firebase-uid>"
RUN_ID="manual-$(date -u +%Y%m%dT%H%M%S)"
gcloud pubsub topics publish digest-user \
  --project=week-wire \
  --message="{\"uid\":\"${UID}\",\"runId\":\"${RUN_ID}\",\"slot\":\"07\"}"

pnpm logs:worker
```

Expect `digest sent {eventCount: N}` or a `skipped` log with a reason
(`no-telegram`, `no-chat`, `disabled`). Telegram message arrives in the linked
chat.

Inspect the idempotency doc:

```bash
gcloud firestore documents describe "runs/${RUN_ID}_${UID}" --project=week-wire
```

### c. Scheduler dry-run

```bash
gcloud scheduler jobs run firebase-schedule-dispatchDigests-europe-west1 \
  --location=europe-west1 --project=week-wire
pnpm logs:dispatcher
```

Expect `dispatch complete {published: N, failed: 0, total: N}`.

### d. End-to-end wait

Wait for the next natural `07:00` or `19:00` Europe/Amsterdam tick — confirm
the Telegram digest arrives.

## 7. Rollback

```bash
# Pause cron
gcloud scheduler jobs pause firebase-schedule-dispatchDigests-europe-west1 \
  --location=europe-west1 --project=week-wire

# Remove a function
firebase functions:delete sendUserDigest  --region=europe-west1 --project=week-wire
firebase functions:delete dispatchDigests --region=europe-west1 --project=week-wire

# Roll back web
firebase apphosting:rollouts:list   --project=week-wire
firebase apphosting:rollouts:rollback <rolloutId> --project=week-wire
```

## Operational notes

- `runs/{runId}_{uid}` documents have a 7-day TTL via `expiresAt`; Firestore
  cleans them up automatically.
- Telegram 401/403 → worker sets `users/{uid}/telegram/config.chatLinked = false`
  - writes `lastError`. Surface this in UI in a follow-up.
- Transient telegram errors (5xx, 429) re-throw after releasing the run claim;
  Pub/Sub redelivers via its default exponential backoff. Configure a dead-letter
  topic if you observe persistent retries.

## Quick reference (pnpm scripts)

| script                  | what it does                          |
| ----------------------- | ------------------------------------- |
| `pnpm deploy:rules`     | firestore rules + indexes             |
| `pnpm deploy:functions` | cloud functions (dispatcher + worker) |
| `pnpm deploy:hosting`   | App Hosting rollout                   |
| `pnpm deploy:all`       | everything `firebase deploy` covers   |
| `pnpm logs:dispatcher`  | tail `dispatchDigests` logs           |
| `pnpm logs:worker`      | tail `sendUserDigest` logs            |
