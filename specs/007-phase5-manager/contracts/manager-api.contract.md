# Hợp đồng bridge: Manager ↔ Main

**Ngày**: 2026-09-13 | **Nhánh**: `007-phase5-manager` | **Mô hình**: [data-model.md](../data-model.md)

Hợp đồng cho preload `window.zaloview` ở Manager. Mọi lời gọi trả Promise; lỗi validation/đọc/ghi là lỗi rõ ràng để UI giữ dữ liệu. Tên namespace `window.zaloview` là đề xuất của phase 5 cho phần chưa triển khai.

## Quy tắc chung

- Chỉ expose đúng 10 API dưới đây; không expose cơ chế gọi chung, không expose `ipcRenderer`/event.
- Main từ chối: sender là website/iframe, URL không phải trang Manager local, payload null/sai kiểu/thừa trường nguy hiểm. Trường hợp vi phạm không chạm storage/socket.
- Không tin `createdAt`/xác nhận do renderer gửi; xác nhận xóa phiên bằng dialog native do main quản lý.

## API

### `getProfiles()` → danh sách Profile

Trả toàn bộ profile đã validate từ registry. Tệp hỏng → lỗi rõ ràng (không giả danh sách rỗng).

### `saveProfile(input)` → `{ profile, shortcut, restartRequired }`

- `input`: `{ id?, name, url, iconPath?, userAgent?, xpathConfig?, desktopConfig? }` (chỉ trường cho phép sửa).
- Main: tạo mới sinh ID + timestamps; cập nhật giữ ID/`createdAt`/tác nhân trình duyệt cũ và mọi cờ `false`; lưu registry xong mới sync shortcut.
- `shortcut`: `ShortcutSyncResult` của phase 4 (`created`/`updated`/`removed`/`unchanged`/`error` + đường dẫn + thông điệp).
- `restartRequired`: so revision snapshot runner với profile đã lưu; không lấy được revision → chưa xác định.

### `deleteProfile(profileId)` → kết quả từng bước

Thứ tự: xác nhận runner dừng thật → gỡ shortcut → xóa registry; giữ session. Lỗi bước nào nêu đúng bước đó và cho thử lại (đặc biệt: gỡ shortcut xong nhưng xóa registry lỗi → profile còn trong danh sách + báo đã gỡ shortcut + cho đồng bộ lại).

### `launchProfile(profileId)` → đã gửi yêu cầu mở

Khởi chạy bằng argument array, process tách rời; trả "đã gửi yêu cầu", không khẳng định runner sẵn sàng trước khi có status.

### `toggleShortcut(profileId, enabled)` → `{ save, shortcut }`

Lưu cờ shortcut trước, rồi gọi service phase 4; hai kết quả trả riêng.

### `getRunnerStatus(profileId)` → `running` / `stopped` / `unknown` + dữ liệu trạng thái

Khi liên lạc được kèm `RunnerStatusData` (trạng thái tải/lỗi, revision đang dùng). Lỗi socket → `unknown`.

### `clearAttention(profileId)` → đã xóa hay chưa

Chuyển `clear-attention` tới đúng socket; không reset mốc so sánh.

### `testXPath(profileId, selector, mode)` → `XPathEvaluationResult` hoặc lỗi phân loại

Chuyển `test-xpath` tới đúng runner/tài liệu; profile chưa lưu/chưa mở → hướng dẫn mở/đăng nhập. Phân biệt match/no-match/invalid-selector/invalid-data/loading/timeout. Không đổi config/baseline, không tạo cảnh báo.

### `chooseIcon()` → đường icon đã chuẩn hóa hoặc hủy

Dialog file → kiểm tra/chuẩn hóa/lưu vào vùng icon app. Hủy dialog không phải lỗi.

### `fetchIcon(url)` → đường icon đã chuẩn hóa hoặc fallback kèm lý do

Tải có trần (HTTP(S), tối đa 5 redirect, timeout 5000 ms, tối đa 2 MiB byte thực, tối đa 1024×1024, không cookie phiên).

### `deleteProfileSession(profileId)` → đã xóa (API riêng)

Xác nhận native do main quản lý; kiểm tra runner dừng + mục tiêu + đường dẫn thuộc app trước khi xóa.
