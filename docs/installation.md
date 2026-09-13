# Cài đặt launcher và shortcut desktop

Tài liệu này mô tả bundle Linux cấp người dùng của ZaloWebView và shortcut `.desktop` do Phase 4 sinh. Không cần quyền `sudo`; Phase 4 không cài đặt vào `/usr` và không tự pin/unpin mục trong panel.

## Bundle launcher

Tạo bundle từ checkout đã cài dependencies:

```bash
npm run package:linux
```

Kết quả mặc định là `build/zaloview-linux-<arch>/`. Bundle chứa toàn bộ Electron runtime (bao gồm `locales/`, `resources.pak` và sandbox) cùng ứng dụng đã build dưới `resources/app/dist/`. Binary `electron` được đổi tên thành `zaloview`; không có `node`, `npm`, source tree hay `node_modules` trong bundle.

Đường cài cấp người dùng ổn định được khuyến nghị là:

```text
$HOME/.local/opt/zaloview/zaloview
```

Sao chép nguyên thư mục bundle, không chỉ sao chép binary:

```bash
mkdir -p "$HOME/.local/opt"
cp -a build/zaloview-linux-$(node -p "process.arch") "$HOME/.local/opt/zaloview"
chmod 755 "$HOME/.local/opt/zaloview/zaloview"
```

`launcherPath` đưa vào service shortcut phải là đường tuyệt đối tới binary trên, ví dụ `/home/<user>/.local/opt/zaloview/zaloview`. Launcher nhận trực tiếp `--profile <id>` và không phụ thuộc thư mục làm việc, `PATH`, Node hoặc npm.

Khi cập nhật, tạo bundle mới rồi thay nội dung tại đúng `$HOME/.local/opt/zaloview`; giữ nguyên đường binary để entry hiện có không bị hỏng. Có thể chạy `--version` để kiểm tra nhanh:

```bash
cd /tmp
env -i PATH=/usr/bin:/bin HOME="$HOME" \
  "$HOME/.local/opt/zaloview/zaloview" --version
```

Khi gỡ, đồng bộ/gỡ các shortcut trước rồi mới xóa bundle:

```text
removeProfileShortcut(<profileId>)
```

Sau khi kết quả là `removed` hoặc `unchanged`, có thể xóa `$HOME/.local/opt/zaloview`. Session profile và icon nguồn không bị service shortcut xóa.

## Vị trí và vòng đời shortcut

Entry cấp người dùng nằm trong `$XDG_DATA_HOME/applications/`, mặc định là `$HOME/.local/share/applications/`, với tên `zaloview-<profileId>.desktop`. File là UTF-8, regular file, mode `0644`, có marker `X-ZaloWebView-ProfileId=<profileId>` để bảo vệ file của ứng dụng khác.

`syncProfileShortcut(profile, launcherPath)` trả riêng một `ShortcutSyncResult` với trạng thái `created`, `updated`, `removed`, `unchanged` hoặc `error`. Lỗi ghi shortcut không rollback profile đã được lưu; lần retry chỉ gọi lại thao tác đồng bộ. Service không gọi `update-desktop-database`, không nhận URL từ entry và không sửa pin/favorites.

Icon chỉ dùng file regular tuyệt đối dưới `$XDG_DATA_HOME/zaloview/icons/`; icon thiếu hoặc ngoài vùng này dùng `applications-internet`. `StartupWMClass=zaloview-<profileId>` phục vụ identity X11; Wayland phải đo `app_id` thực tế, không suy từ khóa này.

## Bằng chứng môi trường hiện có

Các kiểm tra tự động đã chạy trên checkout này:

- `desktop-file-validate 0.28`: đạt với entry sinh từ test profile tên tiếng Việt.
- Bundle smoke: `zaloview --version` đạt từ `/tmp`, đường cài có khoảng trắng và `PATH=/usr/bin:/bin`.
- `plasmashell 6.7.5`, `kded6 6.30.0`; phiên hiện tại báo `Desktop=KDE`, `Type=wayland`.
- `gio 2.88.3` và `xprop 1.2.8` có sẵn; `gnome-shell` không có trong môi trường kiểm tra.

| Desktop | Backend | Validator | Menu ≤30 giây | Mở đúng profile | 10 lần không trùng | Identity | Icon | Pin/unpin | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KDE Plasma 6.7.5 | Wayland | Đạt (0.28) | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa đo `app_id` | Chưa kiểm thử | Chưa kiểm thử | Phiên hiện tại là Wayland; `StartupWMClass` không được dùng làm bằng chứng Wayland. |
| KDE Plasma | X11 | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa đo `WM_CLASS` | Chưa kiểm thử | Chưa kiểm thử | Không có phiên X11 riêng trong lần kiểm tra này. |
| GNOME | X11 | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa đo `WM_CLASS` | Chưa kiểm thử | Chưa kiểm thử | `gnome-shell` không hiện diện. |
| GNOME | Wayland | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa đo `app_id` | Chưa kiểm thử | Chưa kiểm thử | `gnome-shell` không hiện diện. |

Khi có desktop session tương ứng, nghiệm thu từng dòng bằng entry sinh thật và bundle đã cài: chạy `desktop-file-validate`, `gio launch`, xác nhận PID/socket/window đúng profile, mở lặp, icon và thao tác pin/unpin qua UI desktop. Trên X11 dùng `xprop` để đo `WM_CLASS`; trên Wayland dùng inspector/debug trace của compositor để đo `app_id`.

## Manager và launcherPath (Phase 5)

Mở Manager (bảng điều khiển GUI) từ bundle đã cài:

```bash
"$HOME/.local/opt/zaloview/zaloview" --manager
```

Khi chạy dev từ source:

```bash
./bin/zaloview.js --manager
```

`launcherPath` mặc định Manager dùng khi đồng bộ shortcut là `$HOME/.local/opt/zaloview/zaloview` (đường tuyệt đối tới binary đã cài, xem mục Bundle launcher ở trên). Nếu cài ở đường khác, shortcut sinh ra sẽ trỏ sai — cần giữ đúng đường cài ổn định này.

Fallback CLI khi tray không hiện: mọi thao tác Manager đều có lệnh tương đương `zaloview --profile <id>` để mở/khôi phục runner; trạng thái runner kiểm tra qua socket profile (`$XDG_RUNTIME_DIR/zaloview/<id>.sock`, fallback thư mục session). Đóng Manager không đóng runner; mở lặp cùng profile chỉ restore cửa sổ hiện có (single-instance lock theo từng profile).
