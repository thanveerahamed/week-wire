const API = 'https://api.telegram.org';

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramSendError extends Error {
  constructor(
    message: string,
    public readonly errorCode: number | undefined,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'TelegramSendError';
  }
}

function isRetryable(status: number, code: number | undefined): boolean {
  // 5xx + 429 → retry. 4xx (except 429) → drop (bad token, blocked, etc).
  if (status >= 500) return true;
  if (status === 429 || code === 429) return true;
  return false;
}

export async function sendMessage(
  botToken: string,
  args: { chat_id: number; text: string; parse_mode: 'MarkdownV2' | 'HTML' },
): Promise<void> {
  const res = await fetch(`${API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: args.chat_id,
      text: args.text,
      parse_mode: args.parse_mode,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  let payload: TgResponse<unknown> | null = null;
  try {
    payload = (await res.json()) as TgResponse<unknown>;
  } catch {
    // fallthrough
  }
  if (res.ok && payload?.ok) return;
  const description = payload?.description ?? `HTTP ${res.status}`;
  throw new TelegramSendError(
    description,
    payload?.error_code ?? res.status,
    isRetryable(res.status, payload?.error_code),
  );
}
