# Quickstart: Kiểm chứng shortcut desktop theo profile

## Điều kiện trước

- Linux có desktop session cần nghiệm thu.
- Node.js `>= 22.0.0` và dependencies của checkout đã được cài để build/test.
- Có profile thử hợp lệ, không dùng registry/profile thật quan trọng.
- `desktop-file-validate`, `gio`, `xprop` và inspector compositor là tùy chọn; thiếu công cụ phải được ghi trong bằng chứng.

## 1. Kiểm tra tự động

```bash
npm run typecheck
npm test -- tests/desktop-service.test.ts tests/package-linux.test.ts tests/atomic-writer.test.ts tests/profile-storage.test.ts
npm run build
npm run package:linux
npm test
```

Kỳ vọng: mọi lệnh exit `0`; test xác nhận serialization, injection rejection, ownership, vòng đời, rollback, mode file và bundle độc lập.

## 2. Chuẩn bị vùng thử cô lập

```bash
export ZALOVIEW_PHASE4_ROOT="$(mktemp -d)"
export XDG_CONFIG_HOME="$ZALOVIEW_PHASE4_ROOT/config"
export XDG_DATA_HOME="$ZALOVIEW_PHASE4_ROOT/data"
export XDG_RUNTIME_DIR="$ZALOVIEW_PHASE4_ROOT/runtime"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_RUNTIME_DIR"
```

Không đổi `$HOME` và không dùng dữ liệu profile thật. Tạo profile fixture theo hợp đồng hiện có rồi chạy ca tích hợp đồng bộ shortcut.

Kỳ vọng:

- Với profile smoke `phase4-smoke`, entry nằm tại `$XDG_DATA_HOME/applications/zaloview-phase4-smoke.desktop`.
- File là regular file, không phải symlink, mode `0644`.
- Registry fixture vẫn `0600`.
- Lần sync thứ hai trả `unchanged` và bytes không đổi.

## 3. Xác nhận nội dung và escaping

Kiểm tra entry sinh từ profile tên tiếng Việt và launcher path có khoảng trắng. Đối chiếu với [desktop shortcut contract](contracts/desktop-shortcut.md), sau đó chạy khi utility có sẵn:

```bash
desktop-file-validate "$XDG_DATA_HOME/applications/zaloview-phase4-smoke.desktop"
gio launch "$XDG_DATA_HOME/applications/zaloview-phase4-smoke.desktop"
```

Kỳ vọng: validator exit `0`; launcher nhận đúng ba argv. `gio launch` thành công chưa đủ kết luận runner đã mở — phải xác nhận PID/socket/window đúng profile.

## 4. Smoke bundle đã cài

Sao chép nguyên bundle theo [installed launcher contract](contracts/installed-launcher.md) vào một đường cấp người dùng có khoảng trắng, rồi chạy binary tuyệt đối từ cwd ngoài repository với PATH tối thiểu.

```bash
cd /tmp
export ZALOVIEW_INSTALLED_LAUNCHER="$ZALOVIEW_PHASE4_ROOT/install dir/zaloview"
env -i "PATH=/usr/bin:/bin" "XDG_CONFIG_HOME=$XDG_CONFIG_HOME" "XDG_DATA_HOME=$XDG_DATA_HOME" "XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR" "$ZALOVIEW_INSTALLED_LAUNCHER" --version
```

Kỳ vọng: exit `0`, không cần Node/npm/devDependencies. Lặp với `--profile <id>` phải mở đúng profile hoặc báo rõ thành phần runtime/display bị thiếu.

## 5. Kiểm tra vòng đời

Thực hiện theo thứ tự:

1. Bật shortcut: `created`.
2. Đồng bộ không đổi: `unchanged`.
3. Đổi tên/icon: `updated`, không còn nội dung cũ.
4. Tắt shortcut: `removed`.
5. Tắt lại: `unchanged`.
6. Tạo file cùng tên nhưng không có marker, rồi sync/remove: `error`, file không đổi.
7. Mô phỏng write/rename failure: entry cũ và registry vẫn đọc được.

## 6. Nghiệm thu desktop thực

Chỉ dùng shortcut sinh bởi service và launcher bundle đã cài. Ghi một dòng cho mỗi môi trường:

| Môi trường | Phiên bản | Session | Validator | Menu ≤30s | Mở đúng profile | 10 lần mở không trùng | Identity | Icon | Pin/unpin | Giới hạn/Bằng chứng |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KDE Plasma | Chưa kiểm thử | X11 | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | |
| KDE Plasma | Chưa kiểm thử | Wayland | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | |
| GNOME | Chưa kiểm thử | X11 | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | |
| GNOME | Chưa kiểm thử | Wayland | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | |

Trên X11, đo `WM_CLASS` bằng `xprop` và so với `StartupWMClass`. Trên Wayland, đo `app_id` bằng công cụ compositor hoặc debug trace; không suy từ X11. Pin/unpin chỉ thao tác qua UI desktop, không sửa favorites/panel bằng code.

## 7. Dọn vùng thử

Gỡ shortcut fixture bằng service trước khi xóa bundle/vùng thử. Chỉ xóa đúng đường mà `ZALOVIEW_PHASE4_ROOT` trỏ tới và đã được tạo cho ca kiểm chứng; dữ liệu session ngoài vùng này không thuộc phạm vi dọn.
