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

const hasRpmbuild = (() => {
  try {
    execFileSync('rpmbuild', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.runIf(hasRpmbuild)('Linux RPM installer', () => {
  const rootDir = path.resolve(__dirname, '..');
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it(
    'tạo một file .rpm chứa bundle, symlink, sandbox setuid và entry menu',
    () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaloview-rpm-'));
      tempDirs.push(tempDir);
      const outputFile = path.join(tempDir, 'zaloview.rpm');

      execFileSync(process.execPath, [path.join(rootDir, 'scripts/package-rpm.mjs'), '--output', outputFile], {
        cwd: rootDir,
        stdio: 'pipe',
        timeout: 300000
      });

      expect(fs.existsSync(outputFile)).toBe(true);
      const files = execFileSync('rpm', ['-qlpv', outputFile], { encoding: 'utf8' });
      expect(files).toMatch(/\/usr\/bin\/zaloview -> \/usr\/lib(64)?\/zaloview\/zaloview/);
      expect(files).toMatch(/rwsr-xr-x\s+\d+\s+root\s+root\s+.*\/zaloview\/chrome-sandbox/);
      expect(files).toContain('zaloview-manager.desktop');
      expect(files).not.toContain('node_modules');

      const version = (JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as { version: string }).version;
      const info = execFileSync('rpm', ['-qip', outputFile], { encoding: 'utf8' });
      expect(info).toContain('Name        : zaloview');
      expect(info).toContain(`Version     : ${version}`);
    },
    300000
  );
});

const hasDpkgDeb = (() => {
  try {
    execFileSync('dpkg-deb', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.runIf(hasDpkgDeb)('Linux DEB installer', () => {
  const rootDir = path.resolve(__dirname, '..');
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it(
    'tạo một file .deb chứa bundle, symlink, sandbox setuid và entry menu',
    () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaloview-deb-'));
      tempDirs.push(tempDir);
      const outputFile = path.join(tempDir, 'zaloview.deb');

      execFileSync(process.execPath, [path.join(rootDir, 'scripts/package-deb.mjs'), '--output', outputFile], {
        cwd: rootDir,
        stdio: 'pipe',
        timeout: 300000
      });

      const files = execFileSync('dpkg-deb', ['-c', outputFile], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      expect(files).toMatch(/\.\/usr\/bin\/zaloview -> \/usr\/lib\/zaloview\/zaloview/);
      expect(files).toMatch(/-rwsr-xr-x root\/root\s+\d+.*\/usr\/lib\/zaloview\/chrome-sandbox/);
      expect(files).toContain('zaloview-manager.desktop');
      expect(files).toContain('hicolor/512x512/apps/zaloview.png');
      expect(files).not.toContain('node_modules');

      const version = (JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as { version: string }).version;
      const info = execFileSync('dpkg-deb', ['-f', outputFile, 'Package', 'Version'], { encoding: 'utf8' });
      expect(info).toContain('Package: zaloview');
      expect(info).toContain(`Version: ${version}-1`);
    },
    300000
  );
});
