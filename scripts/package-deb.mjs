import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

const ARCH_MAP = { x64: 'amd64', arm64: 'arm64' };

/**
 * Gói Debian/Ubuntu cho các thư viện hệ thống mà binary Electron cần.
 * Dạng "a | b" hỗ trợ cả tên sau đợt chuyển đổi t64 (Ubuntu 24.04+, Debian 13) lẫn tên cũ.
 */
const SYSTEM_DEPENDS = [
  'libc6',
  'libgtk-3-0t64 | libgtk-3-0',
  'libglib2.0-0t64 | libglib2.0-0',
  'libnss3',
  'libnspr4',
  'libatk1.0-0t64 | libatk1.0-0',
  'libatk-bridge2.0-0t64 | libatk-bridge2.0-0',
  'libatspi2.0-0t64 | libatspi2.0-0',
  'libcups2t64 | libcups2',
  'libdbus-1-3',
  'libcairo2',
  'libpango-1.0-0',
  'libexpat1',
  'libx11-6',
  'libxcomposite1',
  'libxdamage1',
  'libxext6',
  'libxfixes3',
  'libxrandr2',
  'libxcb1',
  'libxkbcommon0',
  'libgbm1',
  'libdrm2',
  'libasound2t64 | libasound2',
  'xdg-utils'
];

function debArch() {
  const arch = ARCH_MAP[process.arch];
  if (!arch) {
    throw new Error(`Kiến trúc không được hỗ trợ: ${process.arch} (chỉ hỗ trợ x64, arm64)`);
  }
  return arch;
}

function outputPath(argv, version, arch) {
  if (argv.length === 0) return path.join(rootDir, 'build', `zaloview_${version}-1_${arch}.deb`);
  if (argv.length !== 2 || argv[0] !== '--output' || !argv[1]) {
    throw new Error('Cú pháp: node scripts/package-deb.mjs [--output <file.deb>]');
  }
  return path.resolve(argv[1]);
}

function assertSafeOutput(outputFile) {
  const resolved = path.resolve(outputFile);
  const root = path.parse(resolved).root;
  if (resolved === path.resolve(rootDir) || resolved === root) {
    throw new Error(`Không thể dùng đường output nguy hiểm: ${resolved}`);
  }
  return resolved;
}

function buildBundle() {
  execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'package-linux.mjs')], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  const bundleDir = path.join(rootDir, 'build', `zaloview-linux-${process.arch}`);
  if (!fs.statSync(path.join(bundleDir, 'zaloview'), { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Bundle thiếu binary: ${bundleDir}`);
  }
  return bundleDir;
}

function controlContent({ version, arch, installedSizeKb, author }) {
  return `Package: zaloview
Version: ${version}-1
Section: net
Priority: optional
Architecture: ${arch}
Maintainer: ${author}
Installed-Size: ${installedSizeKb}
Depends: ${SYSTEM_DEPENDS.join(', ')}
Homepage: https://github.com/mraztrea/ZaloWebViewForLinux
Description: Linux Webview Manager cho nhiều profile website độc lập
 ZaloWebView là trình quản lý phiên webview độc lập trên Linux, hỗ trợ nhiều
 website/profile với theo dõi XPath, phát hiện thông báo và shortcut desktop.
`;
}

const DESKTOP_ENTRY = `[Desktop Entry]
Type=Application
Name=ZaloWebView
Comment=Trình quản lý Webview cho nhiều profile
Exec=/usr/bin/zaloview --manager
Icon=zaloview
Terminal=false
Categories=Network;InstantMessaging;
`;

function directorySizeKb(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += fs.statSync(path.join(entry.parentPath, entry.name)).size;
  }
  return Math.ceil(total / 1024);
}

function runDpkgDeb(bundleDir, outputFile, version, arch, author) {
  const stageDir = fs.mkdtempSync(path.join(rootDir, 'build', 'debbuild-'));
  const libDir = path.join(stageDir, 'usr', 'lib', 'zaloview');
  const iconDir = path.join(stageDir, 'usr', 'share', 'icons', 'hicolor', '512x512', 'apps');
  const appsDir = path.join(stageDir, 'usr', 'share', 'applications');
  const binDir = path.join(stageDir, 'usr', 'bin');
  const debianDir = path.join(stageDir, 'DEBIAN');

  try {
    fs.mkdirSync(path.dirname(libDir), { recursive: true });
    fs.cpSync(bundleDir, libDir, { recursive: true, verbatimSymlinks: true });
    fs.chmodSync(path.join(libDir, 'zaloview'), 0o755);
    // Sandbox SUID cần owner root; --root-owner-group đặt owner root trong gói.
    fs.chmodSync(path.join(libDir, 'chrome-sandbox'), 0o4755);

    fs.mkdirSync(iconDir, { recursive: true });
    fs.copyFileSync(
      path.join(libDir, 'resources', 'app', 'dist', 'assets', 'app-icon.png'),
      path.join(iconDir, 'zaloview.png')
    );
    fs.chmodSync(path.join(iconDir, 'zaloview.png'), 0o644);

    fs.mkdirSync(appsDir, { recursive: true });
    fs.writeFileSync(path.join(appsDir, 'zaloview-manager.desktop'), DESKTOP_ENTRY, { mode: 0o644 });

    fs.mkdirSync(binDir, { recursive: true });
    fs.symlinkSync('/usr/lib/zaloview/zaloview', path.join(binDir, 'zaloview'));

    fs.mkdirSync(debianDir, { mode: 0o755 });
    const installedSizeKb = directorySizeKb(path.join(stageDir, 'usr'));
    fs.writeFileSync(
      path.join(debianDir, 'control'),
      controlContent({ version, arch, installedSizeKb, author }),
      { mode: 0o644 }
    );

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    execFileSync('dpkg-deb', ['--root-owner-group', '-Zxz', '--build', stageDir, outputFile], {
      cwd: rootDir,
      stdio: 'inherit'
    });
    fs.chmodSync(outputFile, 0o644);
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

try {
  execFileSync('dpkg-deb', ['--version'], { stdio: 'ignore' });
  const sourcePackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const version = String(sourcePackage.version);
  const arch = debArch();
  const outputFile = assertSafeOutput(outputPath(process.argv.slice(2), version, arch));

  const bundleDir = buildBundle();
  runDpkgDeb(bundleDir, outputFile, version, arch, String(sourcePackage.author ?? 'zaloview'));
  console.log(`[package:deb] DEB đã tạo tại ${outputFile}`);
} catch (error) {
  if (error && error.code === 'ENOENT' && String(error.path).includes('dpkg-deb')) {
    console.error('[package:deb] Không tìm thấy dpkg-deb. Cài đặt bằng: sudo apt install dpkg-dev');
  } else {
    console.error('[package:deb] Đóng gói thất bại:', error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
}
