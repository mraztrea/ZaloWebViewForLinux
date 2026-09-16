import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveLauncherPath } from '../src/main/manager-handlers';

describe('resolveLauncherPath', () => {
  it('trả đường thực của binary đang chạy khi packaged', () => {
    expect(resolveLauncherPath(true)).toBe(fs.realpathSync(process.execPath));
  });

  it('giữ đường cài cấp người dùng khi chạy dev', () => {
    const expected = path.join(os.homedir(), '.local', 'opt', 'zaloview', 'zaloview');
    expect(resolveLauncherPath(false)).toBe(expected);
    expect(resolveLauncherPath()).toBe(expected);
  });
});
