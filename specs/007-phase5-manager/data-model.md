# Mô hình dữ liệu: Manager Phase 5

**Ngày**: 2026-09-13 | **Nhánh**: `007-phase5-manager` | **Nguồn**: [spec.md](spec.md), `src/shared/types.ts`

Tài liệu này mô tả các thực thể ở mức khái niệm (không phải schema triển khai). Type dùng lại trong `src/shared/types.ts` được ghi trong ngoặc; chỉ `ManagerSaveResult` là hợp đồng mới cần thêm sau đối chiếu (đúng yêu cầu phase 5: "thêm hợp đồng sau khi đối chiếu schema").

## 1. Profile (`Profile`)

Hồ sơ website độc lập. Thực thể trung tâm mọi user story.

| Thuộc tính | Ràng buộc | Ghi chú |
|---|---|---|
| Định danh | Bất biến, slug chữ thường, tối đa 64 ký tự | Sinh ở phía main khi tạo; renderer không được gửi `createdAt` |
| Tên | Bắt buộc, tối đa 120 ký tự | Hiển thị nguyên văn, kể cả chuỗi giống mã đánh dấu |
| Địa chỉ | HTTP(S), không kèm thông tin đăng nhập | Validate khi lưu |
| Biểu tượng | Đường dẫn trong vùng icon app | Xem mục 6; thất bại → ảnh dự phòng |
| Tác nhân trình duyệt | Tùy chọn, giữ nguyên khi sửa | Main giữ giá trị cũ nếu renderer không gửi |
| Cấu hình theo dõi | Selector + chế độ + chu kỳ 1000…60000 ms | Rỗng selector = tắt theo dõi |
| Cấu hình tích hợp desktop | 5 cờ (flash, badge, tray, notification, shortcut) | Mọi cờ `false` phải được giữ `false` |
| Thời điểm tạo / cập nhật | ISO timestamp do main quản lý | `cập nhật` đồng thời là revision cấu hình |

Quan hệ: 1 Profile ↔ 0..1 runner đang chạy; 1 Profile ↔ 0..1 dữ liệu phiên giữ lại; 1 Profile ↔ 0..1 shortcut hệ thống.

## 2. Trạng thái runner (`RunnerStatusData` + bao ngoài)

Trạng thái vòng đời theo từng profile.

- Giá trị: `running` (đang chạy) / `stopped` (đã dừng, suy từ không liên lạc được theo cách đã chứng minh) / `unknown` (chưa thể xác định — lỗi socket, timeout, runner chưa báo).
- Khi liên lạc được, kèm dữ liệu trạng thái: định danh profile, địa chỉ, PID, thời gian chạy, trạng thái cửa sổ, revision cấu hình runner đang dùng, lỗi tải trang chính (nếu có), trạng thái theo dõi và cảnh báo hiện tại.
- Trạng thái tải/lỗi riêng của Manager (đang tải / lỗi đọc) khác với trạng thái runner — UI phân biệt hai tầng này.

Chuyển trạng thái: yêu cầu mở → đã gửi yêu cầu (chưa sẵn sàng) → `running` sau xác thực → dừng có xác nhận → `stopped`; mọi lỗi liên lạc → `unknown`.

## 3. Kết quả thử XPath (`XPathEvaluationResult`)

Kết quả đánh giá một lần trên tài liệu hiện tại của đúng runner.

- Phân loại: `match` / `no_match` / `invalid_selector` / `invalid_data` / `loading` / `timeout`. (Năm giá trị đầu ánh xạ enum hiện có; `loading`/`timeout` là trạng thái vòng đời của phép thử.)
- Mỗi kết quả gắn selector và chế độ đã yêu cầu để đối chiếu; kết quả không khớp yêu cầu đang chờ hoặc đến từ tài liệu cũ (sau chuyển hướng) bị bỏ.
- Phép thử không thay đổi cấu hình, mốc so sánh hay cảnh báo.

## 4. Kết quả lưu + đồng bộ (`ManagerSaveResult` — hợp đồng mới)

Kết quả của thao tác lưu profile, gồm 3 phần độc lập:

| Phần | Nội dung |
|---|---|
| `profile` | Profile đã lưu (để UI hiển thị lại) |
| `shortcut` | Kết quả đồng bộ shortcut riêng (`ShortcutSyncResult`: created/updated/removed/unchanged/error + đường dẫn + thông điệp lỗi) |
| `restartRequired` | Có cần mở lại runner / chưa xác định (khi không lấy được revision) |

Quy tắc validation: ID/thời điểm tạo/tác nhân trình duyệt do main giữ; trường cho phép sửa theo whitelist; dữ liệu sai kiểu → lỗi rõ ràng, UI giữ form.

## 5. Kết quả xóa (`DeleteResult` — khái niệm, dùng type cơ bản)

- Xóa profile: chỉ sau xác nhận dừng thật; thứ tự gỡ shortcut → xóa registry; giữ session; lỗi từng bước nêu đúng bước và cho thử lại.
- Xóa phiên: hành động riêng, xác nhận native do main quản lý, nêu rõ định danh + phạm vi; hủy → không đổi dữ liệu.

## 6. Biểu tượng (Icon)

Ảnh đại diện của profile: từ tệp cục bộ (dialog) hoặc tải từ website (favicon/apple-touch-icon, resolve URL tương đối). Trần an toàn: HTTP(S), tối đa 5 redirect (mỗi bước validate), timeout tổng 5000 ms, tối đa 2 MiB (đếm byte thực), tối đa 1024×1024, chuẩn hóa PNG, không cookie/phiên. Mọi thất bại (mạng, ảnh hỏng, quá lớn, timeout, file mất, hủy dialog không tính lỗi) → ảnh dự phòng kèm lý do.

## 7. Dữ liệu phiên (Session)

Dữ liệu đăng nhập/trạng thái website trong thư mục riêng từng profile. Mặc định giữ lại khi xóa profile; profile mới cùng tên không nhận lại phiên cũ (định danh có session còn lại bị từ chối khi tạo mới). Chỉ xóa bằng hành động riêng có xác nhận, sau khi kiểm tra runner dừng và đường dẫn thuộc vùng app.
