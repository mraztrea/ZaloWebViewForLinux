# Build và cài đặt ZaloWebView trên CachyOS / Arch Linux (.pkg.tar.zst)

Tạo gói pacman từ bundle Linux tự chứa. Các bước kiểm tra trước khi đóng gói, bundle và cài cấp người dùng giống [`build-fedora.md`](build-fedora.md).

## 1. Yêu cầu

- CachyOS / Arch Linux 64-bit (x86_64 hoặc aarch64)
- Node.js `>= 22.0.0`, npm `>= 10.0.0`, đã chạy `npm install`
- `makepkg` và `fakeroot` (gói `base-devel`). Nếu thiếu: `sudo pacman -S base-devel`

## 2. Kiểm tra và đóng gói

```bash
npm run typecheck
npm test
npm run package:arch
```

Kết quả: `build/zaloview-<version>-1-<arch>.pkg.tar.zst` (ví dụ `build/zaloview-0.2.1-1-x86_64.pkg.tar.zst`, khoảng 107M). Đổi đường ra bằng:

```bash
node scripts/package-arch.mjs --output /tmp/zaloview.pkg.tar.zst
```

Script tái sử dụng bundle từ `package:linux`, sinh `PKGBUILD` tạm trong `build/pkgbuild-*` rồi chạy `makepkg --force --nodeps` (fakeroot, không cần `sudo`), không thêm dependency npm. `options=('!strip' '!debug')` để makepkg không strip lại binary Electron prebuilt.

## 3. Bố cục cài đặt

| Đường | Nội dung |
| --- | --- |
| `/usr/lib/zaloview/` | Toàn bộ bundle Electron (`chrome-sandbox` setuid root) |
| `/usr/bin/zaloview` | Symlink → `/usr/lib/zaloview/zaloview` |
| `/usr/share/applications/zaloview-manager.desktop` | Entry Manager |
| `/usr/share/icons/hicolor/512x512/apps/zaloview.png` | Icon ứng dụng |

## 4. Cài, kiểm tra và gỡ

```bash
sudo pacman -U ./build/zaloview-0.2.1-1-x86_64.pkg.tar.zst
zaloview --version
zaloview --manager
sudo pacman -R zaloview
```

`pacman -U` tự cài các thư viện phụ thuộc còn thiếu từ repo (`gtk3`, `nss`, `mesa`, `alsa-lib`…).

Ở chế độ packaged, `resolveLauncherPath()` trả về đường thực `/usr/lib/zaloview/zaloview`, nên shortcut `.desktop` do Manager sinh cho từng profile trỏ đúng vào bản cài bằng pacman.
