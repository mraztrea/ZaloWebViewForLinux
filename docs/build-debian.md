# Build và cài đặt ZaloWebView trên Debian/Ubuntu (.deb)

Tạo gói `.deb` từ bundle Linux tự chứa. Các bước kiểm tra trước khi đóng gói, bundle và cài cấp người dùng giống [`build-fedora.md`](build-fedora.md).

## 1. Yêu cầu

- Debian/Ubuntu 64-bit (amd64 hoặc arm64)
- Node.js `>= 22.0.0`, npm `>= 10.0.0`, đã chạy `npm install`
- `dpkg-deb` (gói `dpkg`, có sẵn trên Debian/Ubuntu). Nếu thiếu: `sudo apt install dpkg-dev`

## 2. Kiểm tra và đóng gói

```bash
npm run typecheck
npm test
npm run package:deb
```

Kết quả: `build/zaloview_<version>-1_<arch>.deb` (ví dụ `build/zaloview_0.2.1-1_amd64.deb`, khoảng 92M). Đổi đường ra bằng:

```bash
node scripts/package-deb.mjs --output /tmp/zaloview.deb
```

Script tái sử dụng bundle từ `package:linux` rồi đóng gói bằng `dpkg-deb --root-owner-group` (nén xz), không cần `sudo`/`fakeroot` và không thêm dependency npm.

## 3. Bố cục cài đặt

| Đường | Nội dung |
| --- | --- |
| `/usr/lib/zaloview/` | Toàn bộ bundle Electron (`chrome-sandbox` setuid root) |
| `/usr/bin/zaloview` | Symlink → `/usr/lib/zaloview/zaloview` |
| `/usr/share/applications/zaloview-manager.desktop` | Entry Manager |
| `/usr/share/icons/hicolor/512x512/apps/zaloview.png` | Icon ứng dụng |

Trường `Depends` dùng dạng `tên-t64 | tên-cũ` cho các thư viện đã đổi tên (GTK, ALSA, CUPS…), nên cùng một gói cài được trên Ubuntu 22.04, 24.04+ và Debian 12/13.

## 4. Cài, kiểm tra và gỡ

```bash
sudo apt install ./build/zaloview_0.2.1-1_amd64.deb
zaloview --version
zaloview --manager
sudo apt remove zaloview
```

Dùng `apt install ./file.deb` (thay vì `dpkg -i`) để apt tự cài các thư viện phụ thuộc còn thiếu.

Ở chế độ packaged, `resolveLauncherPath()` trả về đường thực `/usr/lib/zaloview/zaloview`, nên shortcut `.desktop` do Manager sinh cho từng profile trỏ đúng vào bản cài bằng `.deb`.
