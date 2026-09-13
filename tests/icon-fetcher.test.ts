import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { fetchIconBuffer, ICON_MAX_BYTES } from '../src/main/icon-fetcher';

function pngBytes(size: number): Uint8Array {
  return new Uint8Array(size).fill(0x89);
}

function fakeResponse(options: {
  status?: number;
  location?: string;
  contentLength?: string;
  contentType?: string;
  body?: Uint8Array;
}): Response {
  const headers = new Headers();
  if (options.location !== undefined) headers.set('location', options.location);
  if (options.contentLength !== undefined) headers.set('content-length', options.contentLength);
  if (options.contentType !== undefined) headers.set('content-type', options.contentType);
  const body = options.body ?? pngBytes(100);
  return {
    status: options.status ?? 200,
    headers,
    arrayBuffer: async () => body.buffer as ArrayBuffer
  } as Response;
}

describe('icon-fetcher (P5-09)', () => {
  it('từ chối URL không phải HTTP(S)', async () => {
    await expect(fetchIconBuffer('ftp://a.vn/i.png', async () => fakeResponse({}))).rejects.toThrow(
      /INVALID_URL/
    );
    await expect(
      fetchIconBuffer('file:///etc/passwd', async () => fakeResponse({}))
    ).rejects.toThrow(/INVALID_URL/);
  });

  it('tải thành công ảnh PNG nhỏ', async () => {
    const result = await fetchIconBuffer(
      'https://a.vn/icon.png',
      async () => fakeResponse({ contentType: 'image/png', body: pngBytes(1024) })
    );
    expect(result.buffer.length).toBe(1024);
    expect(result.contentType).toBe('image/png');
  });

  it('theo redirect tương đối cùng protocol', async () => {
    const seen: string[] = [];
    const result = await fetchIconBuffer('https://a.vn/icon', async (url) => {
      seen.push(String(url));
      if (seen.length === 1) return fakeResponse({ status: 302, location: '/icon.png' });
      return fakeResponse({ contentType: 'image/png', body: pngBytes(10) });
    });
    expect(seen).toEqual(['https://a.vn/icon', 'https://a.vn/icon.png']);
    expect(result.buffer.length).toBe(10);
  });

  it('chặn redirect đổi protocol https sang http', async () => {
    await expect(
      fetchIconBuffer(
        'https://a.vn/icon',
        async () => fakeResponse({ status: 301, location: 'http://a.vn/icon.png' })
      )
    ).rejects.toThrow(/UNSAFE_REDIRECT/);
  });

  it('chặn redirect thứ 6', async () => {
    await expect(
      fetchIconBuffer(
        'https://a.vn/r0',
        async (url) => fakeResponse({ status: 302, location: `${String(url)}-next` })
      )
    ).rejects.toThrow(/TOO_MANY_REDIRECTS/);
  });

  it('từ chối ngay khi content-length vượt 2 MiB', async () => {
    await expect(
      fetchIconBuffer(
        'https://a.vn/big.png',
        async () => fakeResponse({ contentLength: String(ICON_MAX_BYTES + 1), body: pngBytes(10) })
      )
    ).rejects.toThrow(/TOO_LARGE/);
  });

  it('đếm byte thực khi header thiếu hoặc nói dối', async () => {
    await expect(
      fetchIconBuffer(
        'https://a.vn/lie.png',
        async () => fakeResponse({ contentLength: '10', body: pngBytes(ICON_MAX_BYTES + 5) })
      )
    ).rejects.toThrow(/TOO_LARGE/);
    await expect(
      fetchIconBuffer('https://a.vn/nohead.png', async () =>
        fakeResponse({ body: pngBytes(ICON_MAX_BYTES + 5) })
      )
    ).rejects.toThrow(/TOO_LARGE/);
  });

  it('timeout khi server treo (timeoutMs ngắn trong test)', async () => {
    await expect(
      fetchIconBuffer('https://a.vn/hang.png', () => new Promise<Response>(() => undefined), 50)
    ).rejects.toThrow(/TIMEOUT/);
  });

  it('lỗi mạng lan truyền thành lỗi tải', async () => {
    await expect(
      fetchIconBuffer('https://a.vn/x.png', async () => {
        throw new Error('socket hang up');
      })
    ).rejects.toThrow(/FETCH_FAILED/);
  });
});
