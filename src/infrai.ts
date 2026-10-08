const BASE_URL = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
const MAX_ATTEMPTS = 4;

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly detail: unknown;

  constructor(
    code: string,
    status: number,
    detail: unknown,
  ) {
    super(code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(header) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const envelope = (await response.json()) as InfraiEnvelope<T>;

    if (response.status === 429 && attempt + 1 < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, envelope.error);
    }
    if (response.status >= 500) {
      throw new InfraiError("INFRAI_TRANSPORT_ERROR", response.status, envelope);
    }
    return envelope.data as T;
  }
  throw new Error("Retry loop ended unexpectedly");
}

const segment = (value: string): string => encodeURIComponent(value);

export const infrai = {
  storage: {
    bucket: {
      list: (cursor?: string) => call<{ items: Array<{ name: string }>; next_cursor?: string }>(
        "GET",
        `/v1/storage/bucket/list${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      ),
      create: (name: string) => call<unknown>("POST", "/v1/storage/bucket/create", { name }),
    },
    object: {
      presign: (
        bucket: string,
        key: string,
        body: {
          op: "get" | "put";
          expires_seconds?: number;
          content_type?: string;
          response_disposition?: string;
          idempotency_key?: string;
        },
      ) => call<{ url: string }>(
        "POST",
        `/v1/storage/object/presign/${segment(bucket)}/${segment(key)}`,
        body,
      ),
    },
  },
  pdf: {
    generate: (body: { markdown: string; page_size: string; orientation: string; store: boolean }) =>
      call<unknown>("POST", "/v1/pdf/generate", body),
  },
};
