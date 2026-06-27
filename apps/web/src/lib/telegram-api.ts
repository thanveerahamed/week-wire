import 'server-only';

const API = 'https://api.telegram.org';

export interface TgGetMe {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
}

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly description?: string,
  ) {
    super(message);
    this.name = 'TelegramApiError';
  }
}

async function call<T>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    // Telegram's API is fast; cap to keep server snappy.
    signal: AbortSignal.timeout(10_000),
  });
  let payload: TgResponse<T>;
  try {
    payload = (await res.json()) as TgResponse<T>;
  } catch {
    throw new TelegramApiError(`Telegram returned non-JSON (${res.status})`, res.status);
  }
  if (!res.ok || !payload.ok || payload.result === undefined) {
    throw new TelegramApiError(
      payload.description ?? `Telegram ${method} failed`,
      payload.error_code ?? res.status,
      payload.description,
    );
  }
  return payload.result;
}

export function getMe(botToken: string): Promise<TgGetMe> {
  return call<TgGetMe>(botToken, 'getMe');
}

export function setWebhook(
  botToken: string,
  args: { url: string; secretToken: string },
): Promise<true> {
  return call<true>(botToken, 'setWebhook', {
    url: args.url,
    secret_token: args.secretToken,
    allowed_updates: ['message'],
    drop_pending_updates: true,
    max_connections: 10,
  });
}

export function deleteWebhook(botToken: string): Promise<true> {
  return call<true>(botToken, 'deleteWebhook', { drop_pending_updates: true });
}

export function sendMessage(
  botToken: string,
  args: { chat_id: number; text: string; parse_mode?: 'MarkdownV2' | 'HTML' },
): Promise<unknown> {
  return call<unknown>(botToken, 'sendMessage', {
    chat_id: args.chat_id,
    text: args.text,
    parse_mode: args.parse_mode,
    disable_web_page_preview: true,
  });
}
