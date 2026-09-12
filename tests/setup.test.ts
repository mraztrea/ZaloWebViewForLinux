import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('User Story 1: Project Setup and Manifest Verification', () => {
  const rootDir = path.resolve(__dirname, '..');
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageLockPath = path.join(rootDir, 'package-lock.json');
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');

  it('should have a valid package.json with required fields and scripts', () => {
    expect(fs.existsSync(packageJsonPath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    expect(pkg.name).toBe('zaloview');
    expect(pkg.main).toBe('dist/main/index.js');
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin.zaloview).toBe('./bin/zaloview.js');

    // Required scripts
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.build).toBe('node scripts/build.mjs');
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.scripts.prestart).toBe('npm run build');
    expect(pkg.scripts.start).toBe('electron .');

    // Required engine specification
    expect(pkg.engines?.node).toBeDefined();

    // Required dependencies
    const devDeps = pkg.devDependencies || {};
    expect(devDeps.electron).toBeDefined();
    expect(devDeps.typescript).toBeDefined();
    expect(devDeps.esbuild).toBeDefined();
    expect(devDeps.vitest).toBeDefined();
  });

  it('should have a valid package-lock.json locking all dependencies', () => {
    expect(fs.existsSync(packageLockPath)).toBe(true);
    const lock = JSON.parse(fs.readFileSync(packageLockPath, 'utf-8'));
    expect(lock.name).toBe('zaloview');
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2);
    expect(lock.packages).toBeDefined();
  });

  it('should have strict compiler options in tsconfig.json', () => {
    expect(fs.existsSync(tsconfigPath)).toBe(true);
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.noImplicitAny).toBe(true);
  });
});
