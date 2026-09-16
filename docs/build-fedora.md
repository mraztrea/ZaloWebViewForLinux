# Build và cài đặt ZaloWebView trên Linux Fedora

Hướng dẫn tạo bundle tự chứa (self-contained) và cài đặt cấp người dùng trên Fedora, không cần `sudo`. Chi tiết thêm về bundle và shortcut xem thêm [`installation.md`](installation.md).

## 1. Yêu cầu

- Fedora 64-bit (Wayland hoặc X11)
- Node.js `>= 22.0.0`, npm `>= 10.0.0`
- Dependencies đã cài: `npm install`

## 2. Kiểm tra trước khi đóng gói

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

Cả hai phải sạch/đạt trước khi build.

## 3. Tạo bundle Linux

```bash
npm run package:linux
```

Kết quả mặc định: `build/zaloview-linux-<arch>/` (ví dụ `build/zaloview-linux-x64`, khoảng 283M). Bundle chứa toàn bộ Electron runtime; binary `electron` được đổi tên thành `zaloview`; không có `node`, `npm`, source tree hay `node_modules`.

Smoke test bundle:

```bash
REPO=/path/to/ZaloWebViewForLinux
cd /tmp
env -i PATH=/usr/bin:/bin HOME="$HOME" \
  "$REPO/build/zaloview-linux-x64/zaloview" --version
# zaloview v0.1.0
```

## 3b. Tạo file cài đặt .rpm (Fedora)

Yêu cầu `rpm-build` (đã có sẵn trên Fedora):

```bash
sudo dnf install rpm-build   # chỉ khi chưa có
npm run package:rpm
```

Kết quả: `build/zaloview-<version>-1.<arch>.rpm` (ví dụ `build/zaloview-0.1.0-1.x86_64.rpm`, ~113M). Script tái sử dụng bundle từ `package:linux` rồi đóng gói bằng `rpmbuild`, không thêm dependency npm.

Bố cục cài đặt:

| Đường | Nội dung |
| --- | --- |
| `/usr/lib64/zaloview/` | Toàn bộ bundle Electron |
| `/usr/bin/zaloview` | Symlink → `/usr/lib64/zaloview/zaloview` |
| `/usr/share/applications/zaloview-manager.desktop` | Entry Manager |

Cài, kiểm tra và gỡ:

```bash
sudo dnf install ./build/zaloview-0.1.0-1.x86_64.rpm
zaloview --version
zaloview --manager
sudo dnf remove zaloview
```

Khi ứng dụng chạy ở chế độ packaged, `resolveLauncherPath()` trả về đường thực của binary đang chạy (thay vì `$HOME/.local/opt/zaloview/zaloview`), nên shortcut `.desktop` do Manager sinh ra trỏ đúng cả với bản cài bằng RPM lẫn bản bundle.

## 4. Cài đặt cấp người dùng

Đường cài ổn định được khuyến nghị: `$HOME/.local/opt/zaloview/zaloview`.

```bash
mkdir -p "$HOME/.local/opt"
cp -a build/zaloview-linux-x64 "$HOME/.local/opt/zaloview"
chmod 755 "$HOME/.local/opt/zaloview/zaloview"
```

Sao chép nguyên thư mục bundle, không chỉ sao chép binary. Khi cập nhật, tạo bundle mới rồi thay nội dung tại đúng đường cài để entry `.desktop` hiện có không bị hỏng.

## 5. Khởi chạy

```bash
# Manager Dashboard
"$HOME/.local/opt/zaloview/zaloview" --manager

# Runner theo profile
"$HOME/.local/opt/zaloview/zaloview" --profile <id>

# Kiểm tra phiên bản
"$HOME/.local/opt/zaloview/zaloview" --version
```

`launcherPath` mặc định Manager dùng khi đồng bộ shortcut là `$HOME/.local/opt/zaloview/zaloview`; nếu cài ở đường khác, shortcut sinh ra sẽ trỏ sai.

## 6. Gỡ cài đặt

Đồng bộ/gỡ các shortcut trước, sau đó xóa bundle:

```text
removeProfileShortcut(<profileId>)
rm -rf "$HOME/.local/opt/zaloview"
```
