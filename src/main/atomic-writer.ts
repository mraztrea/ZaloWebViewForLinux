import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Writes data to targetPath atomically via a temporary file in the same directory,
 * followed by fsync and renameSync, ensuring 0600 file permissions and 0700 directory permissions.
 *
 * If an error occurs during writing or syncing, the temporary file is removed
 * and the original target file remains untouched.
 */
export type AtomicFileMode = 0o600 | 0o644;

export function atomicWriteFile(
  targetPath: string,
  content: string | Buffer,
  mode: AtomicFileMode = 0o600
): void {
  if (mode !== 0o600 && mode !== 0o644) {
    throw new RangeError('Chỉ hỗ trợ mode file 0600 hoặc 0644.');
  }

  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}.${randomSuffix}`;

  let fd: number | null = null;
  try {
    fd = fs.openSync(tmpPath, 'w', mode);
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    fs.writeFileSync(fd, buffer);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    fs.chmodSync(tmpPath, mode);
    fs.renameSync(tmpPath, targetPath);
  } catch (error) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close error during error handling
      }
    }
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // ignore unlink error during error handling
    }
    throw error;
  }
}
