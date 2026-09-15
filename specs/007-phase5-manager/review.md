# Review triển khai Manager Phase 5

Phạm vi: thiết kế `007-phase5-manager`, code tại `844cbbc`, bản sửa đã ghi trong `6938513` và các sửa tiếp theo trong working tree. Review ngày 2026-09-14–15.

## Theo dõi công việc

- [x] Đọc spec, plan, hợp đồng, mô hình dữ liệu và kiểm tra các luồng thực thi.
- [x] Review độc lập phần backend; rà UI, vòng đời và bằng chứng kiểm thử.
- [x] Tạo index GitNexus tại commit `844cbbc`; phân tích ảnh hưởng trước sửa.
- [x] Thêm ca hồi quy tái hiện lỗi, xác nhận thất bại trước sửa.
- [x] Sửa các lỗi xác nhận được theo thiết kế hiện có.
- [x] Chạy typecheck, build, toàn bộ test và review lại bản sửa.
- [x] Cập nhật bằng chứng và các bước nghiệm thu chưa thực hiện.

## Các phát hiện đã sửa

| Mức | Sai lệch và tác động | Bản sửa |
|---|---|---|
| P1 | IPC tin mọi URL local trùng hậu tố, kể cả đường giả mạo; payload ID sai kiểu bị hiểu thành tạo mới (FR-017) | So sánh URL Manager chính xác; whitelist trường và kiểm kiểu config trước storage; ID không tồn tại trả `NOT_FOUND` |
| P1 | Xác nhận xóa phiên chờ lâu có thể xóa trong lúc runner đã mở lại; symlink thư mục cha thoát vùng dữ liệu (FR-013/014) | Kiểm tra trạng thái lại sau dialog, kiểm đường thực; chặn lưu/mở đồng thời khi profile đang bị xóa |
| P1 | Launch trả thành công trước lỗi spawn bất đồng bộ; khoảng trống trước khi có socket bị coi là stopped (FR-005/006) | Chờ sự kiện `spawn`/`error`, theo dõi launch đang chờ và PID; chưa chứng minh dừng thì không cho xóa |
| P2 | Lưu mới thành công nhưng shortcut lỗi: retry từ form tạo thêm profile (FR-008) | Lưu ID trả về vào form ngay khi registry đã ghi; retry sửa đúng profile đó |
| P2 | UI không poll, thiếu hiển thị/xóa cảnh báo và không giữ thông tin cần mở lại (FR-001/007/009) | Poll tuần tự khi hiển thị, dừng khi ẩn/đóng; status/card lấy attention và revision, clear đúng ID |
| P2 | `updatedAt` trùng khi lưu trong cùng mili giây làm mất tín hiệu cấu hình đổi | Revision luôn tăng, giữ `createdAt` |
| P2 | Timeout icon đặt lại qua mỗi redirect và không bao phủ body; file local đọc không giới hạn (FR-012) | Một deadline cho cả quá trình, hủy stream, giới hạn đọc 2 MiB, chặn decode quá cỡ/lỗi |
| P2 | Chưa tìm favicon/apple-touch-icon tương đối; icon local và fallback không hiển thị đúng | Đọc link HTML tĩnh theo URL sau redirect, fallback `/favicon.ico`; mã hóa file URL, sửa đường asset và ngừng lặp `onerror`; chỉ nhận đường icon trong vùng app |
| P2 | Icon trong vùng app đã mất khiến lưu cấu hình bị chặn (FR-012) | Dùng icon dự phòng, trả `iconWarning` và hiển thị lý do cả khi lưu thành công hoặc phải retry shortcut |
| P2 | Kết quả XPath cũ có thể ghi sang form vừa mở hoặc ghi đè kết quả mới; UI hiển thị mã kết quả thô (FR-010/016) | Kiểm thứ tự yêu cầu, phiên form và selector/mode ở cả nhánh thành công/lỗi; Việt hóa nhãn, giữ chi tiết lỗi |
| P2 | Reload/icon trả ngược thứ tự ghi đè dữ liệu mới; save chờ reload xong có thể đóng form khác vừa mở (FR-001/008/012/016) | Chỉ nhận reload mới nhất; dùng cùng bộ đếm cho chọn/tải icon; kiểm lại phiên form sau khi reload trước khi đóng |
| P2 | Thiếu chọn theme thủ công, chu kỳ hợp lệ không chia hết 1000 bị form chặn | Chọn hệ thống/sáng/tối; bước nhập chu kỳ là 1 ms trong giới hạn thiết kế |
| P2 | Phản hồi runner/XPath thiếu trường hoặc sai profile vẫn được chấp nhận; lỗi shutdown bị báo sai bước | Validate phản hồi trước sử dụng; trả lỗi dừng ngay khi runner từ chối |
| P2 | Checklist đã đóng các mục chưa có bằng chứng GUI/desktop; hợp đồng ghi 10 API nhưng liệt kê 11 | Mở lại mục nghiệm thu còn thiếu, sửa số lượng API và bổ sung bằng chứng thực |

Nguồn chính: [manager-handlers.ts](../../src/main/manager-handlers.ts), [icon-fetcher.ts](../../src/main/icon-fetcher.ts), [app.ts](../../src/renderer/manager/app.ts), [profile-manager.ts](../../src/main/profile-manager.ts).

## Kiểm chứng bản sửa

- `npm run typecheck`: đạt.
- `npm run build`: đạt.
- `npm test`: **22 tệp / 181 test đạt**, gồm test renderer chạy trên Chrome thật, không có test bị bỏ qua trên máy này.
- `tests/manager-regressions.test.ts`: 14 ca backend; `tests/manager-renderer.test.ts`: chuỗi DOM kiểm các thao tác người dùng và phản hồi ngược thứ tự; cả hai đã được chạy thất bại trước các sửa tương ứng.
- `tests/integration.test.ts`: hai socket server và hai attention controller thật; clear/focus A giữ cảnh báo B; callback hiệu ứng desktop giả lập đúng `AttentionEffects`.
- `git diff --check`: đạt.
- Review độc lập lần cuối: không còn phát hiện trong năm bản sửa bổ sung (reload, chọn/tải icon, XPath, save sau reload, icon bị mất).
- GitNexus đối chiếu từ `844cbbc`: 127 symbol, 56 luồng bị chạm, mức CRITICAL; phần chưa commit sau `6938513`: 54 symbol, 24 luồng, mức CRITICAL. Mảng kết quả đầy đủ, không có cờ partial/truncated. Đây là phạm vi cần kiểm tra, không phải bằng chứng có lỗi; bộ test toàn dự án đã chạy lại.
- Trước sửa bổ sung: `reloadProfiles` (5 symbol, 3 luồng) và kiểu dùng chung `ManagerSaveResult` (30 symbol, 17 tham chiếu trực tiếp) có mức HIGH; đã cảnh báo và kiểm các luồng lưu/tải lại, IPC và renderer.

Theo `ponytail`, bản sửa dùng lại service/storage/socket/attention hiện có, API Node và DOM; không thêm dependency hay engine mới. Tìm icon chỉ đọc link HTML tĩnh; website tạo icon bằng JavaScript dùng fallback.

## Phần nghiệm thu còn lại

Chưa kiểm thử GUI Electron sandbox, bản cài trên desktop, Zalo thật, upload/download, clipboard, mic/cam, tray/badge/pin hoặc thay đổi màn hình trên KDE/GNOME. Chrome headless và các test service không thay thế các bước này. Không kết luận toàn bộ Phase 5 đã nghiệm thu.

Xem [tasks.md](tasks.md) và [docs/verification.md](../../docs/verification.md) để tiếp tục các bước còn thiếu trong môi trường desktop.

## Bằng chứng ban đầu

Sau `npm ci` và `npm run build`, bộ test cũ đạt **20 tệp / 166 test**.
Chưa có test hành vi renderer. Môi trường có Chrome headless, không có DISPLAY/Wayland/Xvfb.

GitNexus: repo/worktree `/home/buiducthanh/projects/canhan/ZaloWebViewForLinux`,
index tại `844cbbc8fa58a2a029b5ecc71139a7d7307473fb`.
`makeCard` và `refreshRunnerStates`: CRITICAL (5 luồng);
`storeIconBuffer`: HIGH (3 luồng); `fetchIconBuffer`: LOW.
Các kết quả UNKNOWN đã được đối chiếu caller trong source, không coi là không ảnh hưởng.
