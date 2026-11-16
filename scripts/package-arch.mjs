import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

const ARCH_MAP = { x64: 'x86_64', arm64: 'aarch64' };

/** Tên gói Arch Linux / CachyOS cho các thư viện hệ thống mà binary Electron prebuilt cần. */
const SYSTEM_DEPENDS = [
  'glibc',
  'gcc-libs',
  'glib2',
  'nspr',
  'nss',
  'at-spi2-core',
  'libcups',
  'dbus',
  'cairo',
  'gtk3',
  'pango',
  'expat',
  'libx11',
  'libxcomposite',
  'libxdamage',
  'libxext',
  'libxfixes',
  'libxrandr',
  'libxcb',
  'libxkbcommon',
  'mesa',
  'libdrm',
  'systemd-libs',
  'alsa-lib',
  'xdg-utils'
];

function pkgArch() {
  const arch = ARCH_MAP[process.arch];
  if (!arch) {
    throw new Error(`Kiến trúc không được hỗ trợ: ${process.arch} (chỉ hỗ trợ x64, arm64)`);
  }
  return arch;
}

function outputPath(argv, version, arch) {
  if (argv.length === 0) return path.join(rootDir, 'build', `zaloview-${version}-1-${arch}.pkg.tar.zst`);
  if (argv.length !== 2 || argv[0] !== '--output' || !argv[1]) {
    throw new Error('Cú pháp: node scripts/package-arch.mjs [--output <file.pkg.tar.zst>]');
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

function pkgbuildContent({ version, license, arch, release, author }) {
  return `# Maintainer: ${author}
pkgname=zaloview
pkgver=${version}
pkgrel=${release}
pkgdesc="Linux Webview Manager cho nhiều profile website độc lập"
arch=('${arch}')
url="https://github.com/mraztrea/ZaloWebViewForLinux"
license=('${license}')
depends=(${SYSTEM_DEPENDS.map((d) => `'${d}'`).join(' ')})
# Electron prebuilt đã strip sẵn; bỏ strip/debug để makepkg không đụng vào binary.
options=('!strip' '!debug')
source=("zaloview-\${pkgver}.tar")
sha256sums=('SKIP')

package() {
  install -dm755 "\${pkgdir}/usr/lib/zaloview"
  tar -xf "\${srcdir}/zaloview-\${pkgver}.tar" -C "\${pkgdir}/usr/lib/zaloview" --strip-components=1
  chmod 0755 "\${pkgdir}/usr/lib/zaloview/zaloview"
  chmod 4755 "\${pkgdir}/usr/lib/zaloview/chrome-sandbox"

  install -Dm644 "\${pkgdir}/usr/lib/zaloview/resources/app/dist/assets/app-icon.png" \\
    "\${pkgdir}/usr/share/icons/hicolor/512x512/apps/zaloview.png"

  install -dm755 "\${pkgdir}/usr/bin"
  ln -sf /usr/lib/zaloview/zaloview "\${pkgdir}/usr/bin/zaloview"

  install -dm755 "\${pkgdir}/usr/share/applications"
  cat > "\${pkgdir}/usr/share/applications/zaloview-manager.desktop" <<'DESKTOP_EOF'
[Desktop Entry]
Type=Application
Name=ZaloWebView
Comment=Trình quản lý Webview cho nhiều profile
Exec=/usr/bin/zaloview --manager
Icon=zaloview
Terminal=false
Categories=Network;InstantMessaging;
DESKTOP_EOF
  chmod 0644 "\${pkgdir}/usr/share/applications/zaloview-manager.desktop"
}
`;
}

function runMakepkg(bundleDir, outputFile, version, arch, license, author) {
  const workDir = fs.mkdtempSync(path.join(rootDir, 'build', 'pkgbuild-'));
  const release = '1';
  const tarball = path.join(workDir, `zaloview-${version}.tar`);

  try {
    // owner root để chrome-sandbox SUID hợp lệ sau khi pacman cài (tar giữ nguyên owner trong gói).
    execFileSync(
      'tar',
      ['-cf', tarball, '--owner=0', '--group=0', '-C', path.dirname(bundleDir), path.basename(bundleDir)],
      { stdio: 'inherit' }
    );
    fs.writeFileSync(
      path.join(workDir, 'PKGBUILD'),
      pkgbuildContent({ version, license, arch, release, author }),
      'utf8'
    );

    // PKGEXT cố định để tên file đầu ra không phụ thuộc /etc/makepkg.conf.
    execFileSync('makepkg', ['--force', '--nodeps'], {
      cwd: workDir,
      stdio: 'inherit',
      env: { ...process.env, PKGDEST: workDir, PKGEXT: '.pkg.tar.zst' }
    });

    const builtPkg = path.join(workDir, `zaloview-${version}-${release}-${arch}.pkg.tar.zst`);
    if (!fs.statSync(builtPkg, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`makepkg không tạo file mong đợi: ${builtPkg}`);
    }
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.copyFileSync(builtPkg, outputFile);
    fs.chmodSync(outputFile, 0o644);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

try {
  execFileSync('makepkg', ['--version'], { stdio: 'ignore' });
  const sourcePackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const version = String(sourcePackage.version);
  const arch = pkgArch();
  const outputFile = assertSafeOutput(outputPath(process.argv.slice(2), version, arch));

  const bundleDir = buildBundle();
  runMakepkg(
    bundleDir,
    outputFile,
    version,
    arch,
    String(sourcePackage.license ?? 'MIT'),
    String(sourcePackage.author ?? 'zaloview')
  );
  console.log(`[package:arch] Gói pacman đã tạo tại ${outputFile}`);
} catch (error) {
  if (error && error.code === 'ENOENT' && String(error.path).includes('makepkg')) {
    console.error('[package:arch] Không tìm thấy makepkg. Cài đặt bằng: sudo pacman -S base-devel');
  } else {
    console.error('[package:arch] Đóng gói thất bại:', error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
}
