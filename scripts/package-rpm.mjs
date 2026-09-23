import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

const ARCH_MAP = { x64: 'x86_64', arm64: 'aarch64' };

/** Fedora package names cho các thư viện hệ thống mà binary Electron cần. */
const SYSTEM_REQUIRES = [
  'glibc',
  'libgcc',
  'glib2',
  'nspr',
  'nss',
  'atk',
  'at-spi2-atk',
  'at-spi2-core',
  'cups-libs',
  'dbus-libs',
  'cairo',
  'gtk3',
  'pango',
  'expat',
  'libX11',
  'libXcomposite',
  'libXdamage',
  'libXext',
  'libXfixes',
  'libXrandr',
  'libxcb',
  'libxkbcommon',
  'mesa-libgbm',
  'systemd-libs',
  'alsa-lib'
];

function rpmArch() {
  const arch = ARCH_MAP[process.arch];
  if (!arch) {
    throw new Error(`Kiến trúc không được hỗ trợ: ${process.arch} (chỉ hỗ trợ x64, arm64)`);
  }
  return arch;
}

function outputPath(argv, version, arch) {
  if (argv.length === 0) return path.join(rootDir, 'build', `zaloview-${version}-1.${arch}.rpm`);
  if (argv.length !== 2 || argv[0] !== '--output' || !argv[1]) {
    throw new Error('Cú pháp: node scripts/package-rpm.mjs [--output <file.rpm>]');
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

function specContent({ version, license, arch, release }) {
  return `Name:           zaloview
Version:        ${version}
Release:        ${release}
Summary:        Linux Webview Manager cho nhiều profile website độc lập
License:        ${license}
BuildArch:      ${arch}
Source0:        zaloview-%{version}.tar
AutoReqProv:    no
Requires:       ${SYSTEM_REQUIRES.join(', ')}

%global debug_package %{nil}
%global __os_install_post %{nil}
%global _binary_payload w3.zstdio

%description
ZaloWebView là trình quản lý phiên webview độc lập trên Linux, hỗ trợ nhiều
website/profile với theo dõi XPath, phát hiện thông báo và shortcut desktop.

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}%{_libdir}/zaloview
tar -xf %{SOURCE0} -C %{buildroot}%{_libdir}/zaloview --strip-components=1
chmod 0755 %{buildroot}%{_libdir}/zaloview/zaloview
chmod 4755 %{buildroot}%{_libdir}/zaloview/chrome-sandbox
# Copy icon chính của app ra ngoài bundle để cài vào icon theme hicolor
mkdir -p %{buildroot}%{_datadir}/icons/hicolor/512x512/apps
cp %{buildroot}%{_libdir}/zaloview/resources/app/dist/assets/app-icon.png \\
  %{buildroot}%{_datadir}/icons/hicolor/512x512/apps/zaloview.png
mkdir -p %{buildroot}%{_bindir}
ln -sf %{_libdir}/zaloview/zaloview %{buildroot}%{_bindir}/zaloview
mkdir -p %{buildroot}%{_datadir}/applications
cat > %{buildroot}%{_datadir}/applications/zaloview-manager.desktop <<'DESKTOP_EOF'
[Desktop Entry]
Type=Application
Name=ZaloWebView
Comment=Trình quản lý Webview cho nhiều profile
Exec=%{_bindir}/zaloview --manager
Icon=zaloview
Terminal=false
Categories=Network;InstantMessaging;
DESKTOP_EOF
chmod 0644 %{buildroot}%{_datadir}/applications/zaloview-manager.desktop
chmod 0644 %{buildroot}%{_datadir}/icons/hicolor/512x512/apps/zaloview.png

%files
%{_bindir}/zaloview
%{_datadir}/applications/zaloview-manager.desktop
%{_datadir}/icons/hicolor/512x512/apps/zaloview.png
%{_libdir}/zaloview/*
`;
}

function runRpmBuild(bundleDir, outputFile, version, arch, license) {
  const topDir = fs.mkdtempSync(path.join(rootDir, 'build', 'rpmbuild-'));
  const sourcesDir = path.join(topDir, 'SOURCES');
  const specsDir = path.join(topDir, 'SPECS');
  const release = '1';
  const tarball = path.join(sourcesDir, `zaloview-${version}.tar`);
  const specFile = path.join(specsDir, 'zaloview.spec');

  try {
    fs.mkdirSync(sourcesDir, { recursive: true });
    fs.mkdirSync(specsDir, { recursive: true });
    execFileSync('tar', ['-cf', tarball, '-C', path.dirname(bundleDir), path.basename(bundleDir)], {
      stdio: 'inherit'
    });
    fs.writeFileSync(specFile, specContent({ version, license, arch, release }), 'utf8');

    execFileSync(
      'rpmbuild',
      ['-bb', '--define', `_topdir ${topDir}`, specFile],
      { cwd: rootDir, stdio: 'inherit' }
    );

    const builtRpm = path.join(topDir, 'RPMS', arch, `zaloview-${version}-${release}.${arch}.rpm`);
    if (!fs.statSync(builtRpm, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`rpmbuild không tạo file mong đợi: ${builtRpm}`);
    }
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.copyFileSync(builtRpm, outputFile);
    fs.chmodSync(outputFile, 0o644);
  } finally {
    fs.rmSync(topDir, { recursive: true, force: true });
  }
}

try {
  execFileSync('rpmbuild', ['--version'], { stdio: 'ignore' });
  const sourcePackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const version = String(sourcePackage.version);
  const arch = rpmArch();
  const outputFile = assertSafeOutput(outputPath(process.argv.slice(2), version, arch));

  const bundleDir = buildBundle();
  runRpmBuild(bundleDir, outputFile, version, arch, String(sourcePackage.license ?? 'MIT'));
  console.log(`[package:rpm] RPM đã tạo tại ${outputFile}`);
} catch (error) {
  if (error && error.code === 'ENOENT' && String(error.path).includes('rpmbuild')) {
    console.error('[package:rpm] Không tìm thấy rpmbuild. Cài đặt bằng: sudo dnf install rpm-build');
  } else {
    console.error('[package:rpm] Đóng gói thất bại:', error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
}
