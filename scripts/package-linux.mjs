import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

function outputPath(argv) {
  if (argv.length === 0) return path.join(rootDir, 'build', `zaloview-linux-${process.arch}`);
  if (argv.length !== 2 || argv[0] !== '--output' || !argv[1]) {
    throw new Error('Cú pháp: node scripts/package-linux.mjs [--output <directory>]');
  }
  return path.resolve(argv[1]);
}

function assertSafeOutput(outputDir) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedOutput = path.resolve(outputDir);
  if (resolvedOutput === resolvedRoot || resolvedOutput === path.parse(resolvedOutput).root) {
    throw new Error(`Không thể dùng đường output nguy hiểm: ${resolvedOutput}`);
  }
  return resolvedOutput;
}

function buildBundle(outputDir) {
  const electronDist = path.join(rootDir, 'node_modules', 'electron', 'dist');
  const appDist = path.join(rootDir, 'dist');
  const buildScript = path.join(rootDir, 'scripts', 'build.mjs');

  execFileSync(process.execPath, [buildScript], { cwd: rootDir, stdio: 'inherit' });
  if (!fs.statSync(electronDist, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Không tìm thấy Electron runtime: ${electronDist}`);
  }
  if (!fs.statSync(path.join(appDist, 'main', 'index.js'), { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Build app thiếu dist/main/index.js: ${appDist}`);
  }

  const stagingDir = `${outputDir}.tmp-${process.pid}`;
  fs.rmSync(stagingDir, { recursive: true, force: true });
  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.cpSync(electronDist, stagingDir, { recursive: true });

    const electronBinary = path.join(stagingDir, 'electron');
    const launcherPath = path.join(stagingDir, 'zaloview');
    if (!fs.statSync(electronBinary, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Electron distribution thiếu binary: ${electronBinary}`);
    }
    fs.renameSync(electronBinary, launcherPath);
    fs.chmodSync(launcherPath, 0o755);

    const appDir = path.join(stagingDir, 'resources', 'app');
    fs.mkdirSync(appDir, { recursive: true });
    fs.cpSync(appDist, path.join(appDir, 'dist'), { recursive: true });

    const sourcePackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const appPackage = {
      name: sourcePackage.name,
      productName: 'ZaloWebView',
      version: sourcePackage.version,
      main: 'dist/main/index.js'
    };
    fs.writeFileSync(path.join(appDir, 'package.json'), `${JSON.stringify(appPackage, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o644
    });

    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.renameSync(stagingDir, outputDir);
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

try {
  const outputDir = assertSafeOutput(outputPath(process.argv.slice(2)));
  buildBundle(outputDir);
  console.log(`[package:linux] Bundle đã tạo tại ${outputDir}`);
} catch (error) {
  console.error('[package:linux] Đóng gói thất bại:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
