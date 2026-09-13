# Nghiên cứu Phase 0: Shortcut desktop theo profile

## Quyết định 1: Giữ service shortcut tách khỏi ProfileManager

**Quyết định**: Tạo `src/main/desktop-service.ts` với hai thao tác đồng bộ và gỡ shortcut; module không ghi registry và không quản lý session.

**Lý do**: ProfileManager hiện có vòng đời lưu dữ liệu ổn định. Tách side effect desktop cho phép báo riêng “profile đã lưu” và “shortcut lỗi”, retry không tạo profile trùng, đồng thời giữ Phase 5 làm nơi orchestration.

**Phương án đã cân nhắc**: Gọi tạo/xóa shortcut trực tiếp trong `ProfileManager` làm mọi create/update/delete phụ thuộc desktop I/O và buộc rollback khó hiểu; bị loại.

## Quyết định 2: Tái sử dụng helper rủi ro cao mà không sửa hành vi

**Quyết định**: Gọi nguyên trạng `validateProfileId`, `resolveDataDir` và `atomicWriteFile(..., 0o644)`. Applications dir được suy ra từ XDG data home mà `resolveDataDir` đã xác định; không đổi mặc định của atomic writer.

**Lý do**: GitNexus impact cho thấy `atomicWriteFile` và `resolveDataDir` có risk CRITICAL, `validateProfileId` có risk HIGH; các helper đã bao phủ validation/fallback và writer đã hỗ trợ `0644` từ remediation R02.

**Phương án đã cân nhắc**: Sửa toàn bộ XDG resolver hoặc mặc định atomic writer sẽ tác động registry/window-state/permission; lặp lại validation trong service dễ lệch hợp đồng; đều bị loại.

## Quyết định 3: Dùng Desktop Entry tối thiểu có marker ownership

**Quyết định**: Sinh một bộ key cố định, thêm `X-ZaloWebView-ProfileId=<id>`, và chỉ update/remove regular file có marker khớp. Symlink hoặc collision không thuộc ứng dụng trả lỗi.

**Lý do**: Tên file được suy từ ID hợp lệ nhưng vẫn có thể trùng file người dùng tự tạo. Marker `X-` được định dạng cho phép và là cách nhỏ nhất để chứng minh ownership trước thao tác phá hủy.

**Phương án đã cân nhắc**: Chỉ tin filename không đủ bảo vệ file cùng tên; lưu registry ownership riêng tạo thêm state phải đồng bộ; cả hai bị loại.

## Quyết định 4: Tách encoding Desktop Entry string và Exec argv

**Quyết định**: Validate control characters trước filesystem, encode trường string theo kiểu của Desktop Entry, encode từng argv của `Exec` theo quy tắc executable argument và escape `%` như field-code literal; không dùng shell.

**Lý do**: `Name`, `Icon` và `Exec` có ngữ cảnh escaping khác nhau. Ghép chuỗi shell hoặc một encoder chung không bảo toàn đúng quote/backslash/dollar/backtick/percent và có thể tạo field/action ngoài ý muốn.

**Phương án đã cân nhắc**: Dùng shell quoting hoặc JSON escaping không tuân chuẩn Desktop Entry; thêm parser/library mới trái YAGNI; bị loại.

## Quyết định 5: Giữ identity `zaloview-<id>` trong Phase 4

**Quyết định**: Filename, `app.setDesktopName` và `StartupWMClass` cùng dùng `zaloview-<id>`; đo thực tế riêng X11 và Wayland.

**Lý do**: Đây là hợp đồng đã có trong code và tài liệu Phase 1–4. Desktop Entry 1.5 và Electron khuyến nghị reverse-DNS nhưng bắt buộc trực tiếp ở đây là basename phải khớp `app.setDesktopName`; identity hiện tại đáp ứng luồng menu/ghép cửa sổ trong phạm vi Phase 4 khi được đo.

**Phương án đã cân nhắc**: Đổi ngay sang reverse-DNS cải thiện khả năng portal/Flatpak tương lai nhưng kéo migration identity, fixture, pin và tài liệu phase trước vào feature hiện tại. Hoãn đến khi có yêu cầu GlobalShortcuts/Flatpak cụ thể.

## Quyết định 6: Dùng bundle Electron portable, không dùng launcher dev làm sản phẩm

**Quyết định**: Script Node standard library đóng gói toàn bộ Electron runtime hiện có với `dist` vào bundle Linux theo kiến trúc. Binary đã đổi tên trong bundle là launcher tuyệt đối của Desktop Entry.

**Lý do**: `bin/zaloview.js` hiện cần Node và `node_modules/electron/cli.js`; `npm pack` không chứa runtime. Electron hỗ trợ phân phối bằng cách đặt app dưới `resources/app`, và runtime đã khóa có đủ binary/thư viện/locales.

**Phương án đã cân nhắc**: Giữ checkout/devDependencies không đóng R01; chuyển Electron sang runtime dependency vẫn yêu cầu Node/npm lúc cài; Forge/electron-builder/AppImage/deb thêm dependency và phạm vi signing/updater chưa cần.

## Quyết định 7: Không gọi update-desktop-database

**Quyết định**: Ghi Desktop Entry nguyên tử rồi để desktop session tự quan sát; dùng `desktop-file-validate` khi có nhưng không yêu cầu nó ở runtime.

**Lý do**: `update-desktop-database` xây MIME cache và không bảo đảm menu refresh; entry Phase 4 không đăng ký MIME. Thiếu utility không được biến shortcut hợp lệ thành lỗi.

**Phương án đã cân nhắc**: Gọi utility sau mọi sync tăng phụ thuộc và tạo tín hiệu thành công giả; bị loại.

## Quyết định 8: Dùng state idempotent và giữ file cũ khi lỗi

**Quyết định**: So sánh bytes trước khi ghi; cùng nội dung trả `unchanged`. Tạo/cập nhật dùng atomic writer `0644`; remove file không tồn tại trả `unchanged`; validation lỗi xảy ra trước I/O, lỗi hệ thống trả kết quả `error` có thể retry.

**Lý do**: Tránh churn timestamp/menu, bảo vệ shortcut đang dùng và cho Phase 5 thông báo chính xác mà không rollback registry.

**Phương án đã cân nhắc**: Ghi lại mỗi lần hoặc ném mọi I/O error lên workflow làm mất phân biệt giữa lưu profile và shortcut; bị loại.

## Quyết định 9: Nghiệm thu bằng bằng chứng quan sát, không suy chéo desktop

**Quyết định**: Ma trận KDE/GNOME × X11/Wayland ghi từng kết quả hoặc “Chưa kiểm thử”; xác nhận PID/socket/window sau launch, không chỉ dựa vào exit code của launcher hoặc API desktop.

**Lý do**: Menu, icon, focus và pin phụ thuộc compositor, extension và policy desktop. `StartupWMClass` không chứng minh Wayland app ID.

**Phương án đã cân nhắc**: Chỉ unit test serializer hoặc coi API trả thành công là PASS không chứng minh trải nghiệm người dùng; bị loại.

## Nguồn

- [Đặc tả Phase 4 hiện có](../../docs/phases/phase-4-shortcuts/spec.md)
- [Kế hoạch Phase 4 hiện có](../../docs/phases/phase-4-shortcuts/plan.md)
- [Desktop Entry Specification 1.5](https://specifications.freedesktop.org/desktop-entry/latest-single/)
- [XDG Base Directory Specification 0.8](https://specifications.freedesktop.org/basedir/0.8/)
- [Electron 44.3 — app.setDesktopName](https://github.com/electron/electron/blob/v44.3.0/docs/api/app.md)
- [Wayland xdg-shell app_id](https://gitlab.freedesktop.org/wayland/wayland-protocols/-/blob/main/stable/xdg-shell/xdg-shell.xml)
- [Icon Theme Specification](https://specifications.freedesktop.org/icon-theme/latest/)
- [desktop-file-utils — update-desktop-database](https://gitlab.freedesktop.org/xdg/desktop-file-utils/-/blob/master/man/update-desktop-database.1)

Mọi điểm chưa rõ trong bối cảnh kỹ thuật đã được giải quyết qua các quyết định trên.
