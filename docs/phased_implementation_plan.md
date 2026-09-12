# Lộ trình triển khai 5 phase

Ngày cập nhật: 12/09/2026. Trạng thái: kế hoạch, chưa có phase nào được triển khai hoặc nghiệm thu.

Thiết kế chuẩn: [Đặc tả kỹ thuật](design_specification.md). Đầu việc và kiểm tra chi tiết: [Kế hoạch 8 task](detailed_tasks_plan.md).

## Tổng quan

| Phase | Task | Sản phẩm có thể kiểm tra |
| --- | --- | --- |
| 1 — Runner và dữ liệu | 1–3 | CLI mở hai profile độc lập, khóa đúng profile, giữ session và xác minh danh tính Linux |
| 2 — XPath | 4 | Observer báo trạng thái đúng mode, bắt cả giảm/mất node, thử XPath trong session runner |
| 3 — Desktop notification | 5 | Attention/badge/tray/popup và focus clear đúng trạng thái, có fallback desktop |
| 4 — Shortcut | 6 | Desktop entry hợp lệ, chạy launcher đã cài, kiểm tra menu và pin |
| 5 — Manager và nghiệm thu | 7–8 | GUI đầy đủ API, quản lý profile và báo cáo nghiệm thu theo môi trường |

Chỉ chuyển phase khi tiêu chí của phase trước đã đạt trên môi trường phát triển đã ghi rõ. Tính năng desktop không được môi trường hỗ trợ phải ghi giới hạn; không coi đó là đã đạt toàn bộ nền tảng. Chưa có GUI ở các phase đầu nên dùng fixture cấu hình trong thư mục XDG thử nghiệm, không ghi đè cấu hình thật.

## Phase 1 — Runner, dữ liệu và nền tảng Linux

**Mục tiêu:** mở website bằng cửa sổ native không thanh địa chỉ/menu trình duyệt, giữ phiên riêng cho từng profile.

- [ ] Task 1: chọn runtime còn hỗ trợ, khóa dependencies, build main/preload/renderer theo từng môi trường; launcher truyền argument đúng và chạy từ cwd khác.
- [ ] Task 2: registry có schema/version, validate, ghi nguyên tử; runner chỉ đọc cấu hình và ghi window-state riêng.
- [ ] Task 3: parser CLI, userData/sessionData và single-instance lock riêng, partition persist, sandbox và chính sách permission/navigation.
- [ ] Socket status/shutdown riêng runner, schema/timeout/quyền filesystem và xử lý stale socket.
- [ ] Thử sớm WM_CLASS/app ID với desktop entry fixture trên Electron đã chọn; chưa cần hoàn thiện service sinh shortcut.
- [ ] Lưu normal bounds/maximized; lỗi loading và quyền mic/cam hiển thị rõ.

**Nghiệm thu:**

1. Sau build, `npm start -- --profile zalo` mở fixture profile `zalo`; argument không bị script start cố định thành Manager.
2. Mở profile thứ hai: đăng nhập khác, dữ liệu không trộn. Đóng/mở lại giữ session khi website chưa thu hồi đăng nhập.
3. Mở lại `zalo` khi minimized/đang startup chỉ khôi phục instance đó; không chiếm lock của profile khác.
4. Camera/microphone chỉ được cấp theo origin và lựa chọn người dùng; từ chối vẫn dùng chat được.
5. JSON hỏng báo lỗi và giữ nguyên file; sửa cấu hình không bị snapshot runner ghi đè khi đóng.
6. Ghi kết quả đo danh tính trên backend đích; không dùng tùy chọn BrowserWindow không có API hoặc bỏ lỗi TypeScript.

## Phase 2 — XPath observer và so sánh trạng thái

**Mục tiêu:** đọc trạng thái DOM và truyền sang main chính xác theo mẫu quan sát.

- [ ] Task 4: ba mode existence, badge_count, text_content theo đặc tả; selector lỗi khác no-match.
- [ ] MutationObserver bắt cả attributes, debounce 300 ms, polling mặc định 3000 ms; cleanup đầy đủ và quét lại khi resume/hiển thị.
- [ ] IPC `xpath:init`, `xpath:state`, `xpath:error` nhất quán; main xác thực sender và payload.
- [ ] Cập nhật baseline cả khi count giảm/node mất. Focus không reset baseline.
- [ ] Thử XPath qua runner cùng session, không thay đổi config/baseline và không phát cảnh báo; có request ID và timeout.

**Nghiệm thu:**

1. Test mode/parser/observer theo Task 4 đạt; `5 → 3 → 4` nhận đúng lần tăng cuối.
2. Thay class làm selector đổi match được phát hiện; init lại không sinh timer trùng.
3. Selector rỗng tắt observer; XPath lỗi hiển thị lỗi, không giả thành “không có tin”.
4. Thử XPath trên trang đã đăng nhập của đúng profile, trả preview/no-match/error; kiểm tra navigation trong khi đang test.
5. Selector Zalo thực tế phải được xác minh trên DOM tại lúc thử; ví dụ cũ không phải selector được bảo đảm.

## Phase 3 — Thông báo Linux và xóa cảnh báo khi focus

**Mục tiêu:** chuyển thay đổi XPath thành attention của từng runner, phục hồi cửa sổ và thoát an toàn.

- [ ] Task 5: main state machine quản lý flash, badge, tray và Electron Notification.
- [ ] Cooldown popup 2000 ms, giữ sự kiện mới nhất; badge/tray vẫn cập nhật ngay.
- [ ] Focus/clear-attention xóa attention, popup và timer chờ; giữ baseline DOM.
- [ ] Icon unread khác icon thường, tooltip theo đúng mode; menu mở cửa sổ, xóa cảnh báo, mở Manager và thoát.
- [ ] minimizeToTray mặc định tắt, chỉ bật theo lựa chọn; có cách khôi phục qua CLI/Manager kể cả tray host không hiển thị.
- [ ] Quit đi qua lưu dữ liệu và dọn tài nguyên, không bị close-to-tray chặn.

**Nghiệm thu:**

1. Ở nền nhận thay đổi mới: popup/attention hoạt động theo khả năng desktop được ghi rõ.
2. `5 → focus → blur → 5` không báo lại; `5 → focus → blur → 6` tạo cảnh báo.
3. Count giảm cập nhật badge, về zero xóa attention. Focus A không ảnh hưởng badge B.
4. Tin dồn trong cooldown không spam popup; focus hoặc zero hủy popup đang chờ.
5. X và Thoát khác nhau đúng lựa chọn; khôi phục cửa sổ được khi tray không hiện.
6. Badge có thể cần desktop entry fixture từ phase 1 cho đến khi generator phase 4 hoàn tất. Không suy rằng API trả thành công đồng nghĩa icon hiển thị.

## Phase 4 — Menu shortcut và cài launcher

**Mục tiêu:** shortcut mở đúng runner từ desktop session và được liên kết đúng icon khi môi trường hỗ trợ.

- [ ] Task 6: sinh/cập nhật/xóa desktop entry dưới XDG_DATA_HOME/applications.
- [ ] Exec trỏ launcher đã cài; encode đúng Desktop Entry/Exec, bỏ URL placeholder/action chưa hỗ trợ.
- [ ] Đồng bộ filename, desktopName và WM_CLASS/app ID đã đo.
- [ ] Ghi nguyên tử, mode 0644; lỗi shortcut trả riêng với kết quả lưu cấu hình.
- [ ] Không phụ thuộc update-desktop-database để bảo đảm menu refresh; xử lý utility thiếu nếu dùng.

**Nghiệm thu:**

1. Fixture sinh ra qua `desktop-file-validate` khi có utility; kiểm tra tên/đường dẫn chứa ký tự đặc biệt và input injection.
2. Menu KDE/GNOME tìm thấy profile, shortcut mở đúng từ cwd/PATH khác môi trường dev.
3. Mở shortcut lặp khôi phục runner cũ, không tạo cửa sổ trùng.
4. Pin/unpin và icon riêng được kiểm tra trên backend đang dùng; Wayland không suy kết quả từ StartupWMClass.
5. Tắt shortcut/xóa profile gỡ đúng file thuộc app; không xóa dữ liệu người dùng ngoài mục tiêu.

## Phase 5 — Dashboard và nghiệm thu đầu cuối

**Mục tiêu:** người dùng quản lý profile qua GUI, không cần sửa JSON thủ công.

- [ ] Task 7: bridge đủ handler và validation; cards, tìm kiếm, theme, thêm/sửa/xóa, trạng thái, launch và shortcut.
- [ ] Form giữ mọi checkbox/trường khi edit; lỗi lưu không làm mất dữ liệu đang nhập, trạng thái cần mở lại được hiển thị.
- [ ] Chọn/tải icon với giới hạn và fallback; không render HTML từ tên/URL.
- [ ] Nút thử XPath trên runner đã lưu/mở/đăng nhập; hiển thị kết quả hoặc hướng dẫn/lỗi rõ ràng.
- [ ] Xóa profile đợi runner dừng, giữ session mặc định; xóa session là thao tác riêng có xác nhận trong ứng dụng.
- [ ] Task 8: build/test từ checkout sạch, smoke bản phân phối, kiểm thử thực và hướng dẫn chạy/cài.

**Nghiệm thu:**

1. Từ GUI: thêm profile → mở/đăng nhập → thử XPath → nhận cảnh báo → focus clear → tạo shortcut → mở lại → sửa → xóa.
2. Manager đóng không tắt runner; mở Manager từ tray vào instance Manager riêng.
3. Test XSS/IPC origin, JSON hỏng, lỗi ghi, mạng lỗi, runner crash và socket cũ có kết quả đúng.
4. Build/typecheck/test đạt và báo cáo ghi phiên bản runtime, môi trường Linux, kết quả thực tế.

## Ma trận cần ghi khi nghiệm thu

| Môi trường | Web/session | Alert/focus | Badge/tray | Menu/pin |
| --- | --- | --- | --- | --- |
| KDE Plasma / X11 | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử |
| KDE Plasma / Wayland | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử |
| GNOME / X11, nếu có | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử |
| GNOME / Wayland | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử |

Ghi extension tray/dock, notification service và chính sách không làm phiền khi chúng ảnh hưởng kết quả. Chỉ thay “Chưa kiểm thử” bằng kết quả có bằng chứng; không dự đoán PASS hoặc cam kết mọi môi trường giống nhau.
