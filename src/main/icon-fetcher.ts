/**
 * Icon Fetcher (Main Process)
 *
 * Tải biểu tượng từ website với trần an toàn và chuẩn hóa PNG về vùng
 * icon của app. Một deadline chung bao phủ trang HTML, redirect và body.
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
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const download = async (): Promise<FetchedIcon> => {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new IconFetchError('INVALID_URL', `Địa chỉ không hợp lệ: ${url}`);
  }
  if (!['http:', 'https:'].includes(current.protocol) || current.username || current.password) {
    throw new IconFetchError('INVALID_URL', 'Chỉ chấp nhận địa chỉ HTTP(S).');
  }
  let redirects = 0;
  let readHtml = false;
  for (;;) {
    controller.signal.throwIfAborted();
    const response = await fetchImpl(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        credentials: 'omit',
        headers: { accept: 'image/*, text/html' }
      });

    if (isRedirectStatus(response.status)) {
      void response.body?.cancel().catch(() => undefined);
      if (redirects++ >= ICON_MAX_REDIRECTS) {
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
      if (!['http:', 'https:'].includes(next.protocol) || next.username || next.password) {
        throw new IconFetchError('UNSAFE_REDIRECT', 'Redirect sang protocol không an toàn.');
      }
      if (current.protocol === 'https:' && next.protocol !== 'https:') {
        throw new IconFetchError('UNSAFE_REDIRECT', 'Redirect hạ cấp từ HTTPS xuống HTTP.');
      }
      current = next;
      continue;
    }

    if (response.status !== 200) {
      void response.body?.cancel().catch(() => undefined);
      throw new IconFetchError('FETCH_FAILED', `Máy chủ trả mã ${response.status}.`);
    }
    const declared = response.headers.get('content-length');
    if (declared !== null && Number(declared) > ICON_MAX_BYTES) {
      void response.body?.cancel().catch(() => undefined);
      throw new IconFetchError('TOO_LARGE', 'Biểu tượng vượt quá 2 MiB.');
    }
    const buffer = await readBodyWithLimit(response, controller.signal);
    if (!readHtml && /text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') ?? '')) {
      readHtml = true;
      const iconUrl = findPageIcon(buffer.toString('utf8'), current);
      if (!['http:', 'https:'].includes(iconUrl.protocol) || iconUrl.username || iconUrl.password
        || (current.protocol === 'https:' && iconUrl.protocol !== 'https:')) {
        throw new IconFetchError('UNSAFE_REDIRECT', 'Địa chỉ icon trong trang không an toàn.');
      }
      current = iconUrl;
      continue;
    }
    return { buffer, contentType: response.headers.get('content-type') };
  }
  };
  try {
    return await Promise.race([
      download(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new IconFetchError('TIMEOUT', `Quá thời gian chờ ${timeoutMs} ms khi tải biểu tượng.`));
          controller.abort();
        }, timeoutMs);
      })
    ]);
  } catch (err: unknown) {
    if (err instanceof IconFetchError) throw err;
    throw new IconFetchError('FETCH_FAILED', `Không thể tải biểu tượng: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function findPageIcon(html: string, page: URL): URL {
  // ponytail: chỉ đọc link HTML tĩnh; icon tạo bằng JS dùng /favicon.ico.
  for (const [tag] of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const match of tag.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
    }
    if (attrs.rel?.toLowerCase().split(/\s+/).some(rel => ['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed'].includes(rel)) && attrs.href) {
      return new URL(attrs.href.replace(/&amp;/gi, '&').replace(/&#(x[0-9a-f]+|\d+);/gi,
        (_, code: string) => String.fromCodePoint(Number.parseInt(code.replace(/^x/i, ''), /^x/i.test(code) ? 16 : 10))), page);
    }
  }
  return new URL('/favicon.ico', page);
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readBodyWithLimit(response: Response, signal: AbortSignal): Promise<Buffer> {
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
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
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
    signal.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
