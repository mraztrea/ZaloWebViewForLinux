import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

describe('Linux launcher bundle', () => {
  const rootDir = path.resolve(__dirname, '..');
  const outputDirs: string[] = [];

  afterEach(() => {
    for (const outputDir of outputDirs.splice(0)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('builds a self-contained Electron bundle without Node/npm runtime files', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaloview-bundle-'));
    outputDirs.push(outputDir);

    execFileSync(process.execPath, [path.join(rootDir, 'scripts/package-linux.mjs'), '--output', outputDir], {
      cwd: rootDir,
      stdio: 'pipe'
    });

    const appPackage = JSON.parse(fs.readFileSync(path.join(outputDir, 'resources', 'app', 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(appPackage.main).toBe('dist/main/index.js');
    expect(appPackage.dependencies).toBeUndefined();
    expect(fs.existsSync(path.join(outputDir, 'resources', 'app', 'dist', 'main', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'locales'))).toBe(true);
    expect(fs.statSync(path.join(outputDir, 'zaloview')).mode & 0o111).not.toBe(0);
    expect(fs.existsSync(path.join(outputDir, 'node_modules'))).toBe(false);
  });
});
