/**
 * Icon Fetcher (Main Process)
 *
 * Tải biểu tượng từ website với trần an toàn và chuẩn hóa PNG về vùng
 * icon của app. Triển khai đầy đủ ở T022; khung hiện tại chỉ khai báo
 * hằng số, kiểu và chữ ký để manager-handlers biên dịch được.
 */

export const ICON_FETCH_TIMEOUT_MS = 5000;
export const ICON_MAX_REDIRECTS = 5;
export const ICON_MAX_BYTES = 2 * 1024 * 1024;
export const ICON_MAX_DIMENSION = 1024;

export interface FetchedIcon {
  buffer: Buffer;
  contentType: string | null;
}

export type ImageDecoder = (
  buffer: Buffer
) => { width: number; height: number; png: Buffer } | null;

export class IconFetchError extends Error {
  public readonly reason: string;

  constructor(reason: string, message: string) {
    super(`${reason}: ${message}`);
    this.name = 'IconFetchError';
    this.reason = reason;
  }
}

export async function fetchIconBuffer(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = ICON_FETCH_TIMEOUT_MS
): Promise<FetchedIcon> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new IconFetchError('INVALID_URL', `Địa chỉ không hợp lệ: ${url}`);
  }
  if (current.protocol !== 'http:' && current.protocol !== 'https:') {
    throw new IconFetchError('INVALID_URL', 'Chỉ chấp nhận địa chỉ HTTP(S).');
  }
  const downgradeFromHttps = current.protocol === 'https:';

  for (let redirect = 0; redirect <= ICON_MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const settled = await Promise.race([
      fetchImpl(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'image/*' }
      }).then(
        (response) => ({ kind: 'ok' as const, response }),
        (error: unknown) => ({ kind: 'error' as const, error })
      ),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
      })
    ]);
    if (settled.kind === 'timeout') {
      controller.abort();
      throw new IconFetchError('TIMEOUT', `Quá thời gian chờ ${timeoutMs} ms khi tải biểu tượng.`);
    }
    if (settled.kind === 'error') {
      if (controller.signal.aborted) {
        throw new IconFetchError('TIMEOUT', `Quá thời gian chờ ${timeoutMs} ms khi tải biểu tượng.`);
      }
      throw new IconFetchError('FETCH_FAILED', `Không thể tải biểu tượng: ${(settled.error as Error).message}`);
    }
    const response = settled.response;

    if (isRedirectStatus(response.status)) {
      if (redirect >= ICON_MAX_REDIRECTS) {
        throw new IconFetchError('TOO_MANY_REDIRECTS', `Vượt quá ${ICON_MAX_REDIRECTS} redirect.`);
      }
      const location = response.headers.get('location');
      if (!location) {
        throw new IconFetchError('UNSAFE_REDIRECT', 'Redirect thiếu địa chỉ đích.');
      }
      let next: URL;
      try {
        next = new URL(location, current.toString());
      } catch {
        throw new IconFetchError('UNSAFE_REDIRECT', `Địa chỉ redirect không hợp lệ: ${location}`);
      }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new IconFetchError('UNSAFE_REDIRECT', 'Redirect sang protocol không an toàn.');
      }
      if (downgradeFromHttps && next.protocol !== 'https:') {
        throw new IconFetchError('UNSAFE_REDIRECT', 'Redirect hạ cấp từ HTTPS xuống HTTP.');
      }
      current = next;
      continue;
    }

    if (response.status !== 200) {
      throw new IconFetchError('FETCH_FAILED', `Máy chủ trả mã ${response.status}.`);
    }
    const declared = response.headers.get('content-length');
    if (declared !== null && Number(declared) > ICON_MAX_BYTES) {
      throw new IconFetchError('TOO_LARGE', 'Biểu tượng vượt quá 2 MiB.');
    }
    const buffer = await readBodyWithLimit(response);
    return { buffer, contentType: response.headers.get('content-type') };
  }

  throw new IconFetchError('TOO_MANY_REDIRECTS', `Vượt quá ${ICON_MAX_REDIRECTS} redirect.`);
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readBodyWithLimit(response: Response): Promise<Buffer> {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > ICON_MAX_BYTES) {
      throw new IconFetchError('TOO_LARGE', 'Biểu tượng vượt quá 2 MiB.');
    }
    return data;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > ICON_MAX_BYTES) {
          throw new IconFetchError('TOO_LARGE', 'Biểu tượng vượt quá 2 MiB.');
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
