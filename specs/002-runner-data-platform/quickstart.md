# Quickstart & Verification Guide: Nền tảng Runner và Quản lý Dữ liệu Phiên

**Feature**: `002-runner-data-platform`
**Date**: 2026-09-12
**Status**: Completed

Tài liệu này hướng dẫn cách kiểm chứng toàn diện các tính năng của **Phase 1: Runner, dữ liệu và nền tảng Linux** sau khi hoàn thành cài đặt.

---

## 1. Yêu cầu Tiên quyết & Chuẩn bị Môi trường

- Hệ điều hành: Linux (Ubuntu 22.04+, Fedora 40+, Arch Linux hoặc tương đương với X11/Wayland).
- Node.js >= 22.0.0, npm >= 10.0.0.
- Mã nguồn đã được biên dịch sạch:
  ```bash
  npm run typecheck
  npm run build
  npm test
  ```

---

## 2. Các Kịch bản Kiểm chứng Đầu cuối (End-to-End Scenarios)

### Kịch bản 1: Quản lý Cấu hình & Ghi Nguyên tử (Atomic Write Resilience)

**Mục tiêu**: Kiểm tra việc tạo, đọc cấu hình profile và khả năng phục hồi dữ liệu khi tệp bị hỏng.

1. **Khởi tạo dữ liệu cấu hình mẫu**:
   Tạo tệp cấu hình thử nghiệm tại thư mục XDG:
   ```bash
   mkdir -p ~/.config/zaloview
   cat << 'EOF' > ~/.config/zaloview/profiles.json
   {
     "schemaVersion": 1,
     "profiles": [
       {
         "id": "zalo-acc-1",
         "name": "Zalo Cá Nhân",
         "url": "https://chat.zalo.me",
         "xpathConfig": {
           "selector": "",
           "mode": "badge_count",
           "pollIntervalMs": 3000
         },
         "desktopConfig": {
           "flashTaskbar": true,
           "showTaskbarBadge": true,
           "minimizeToTray": false,
           "showDesktopNotification": true,
           "createDesktopShortcut": true
         },
         "createdAt": "2026-09-12T10:00:00.000Z",
         "updatedAt": "2026-09-12T10:00:00.000Z"
       },
       {
         "id": "zalo-acc-2",
         "name": "Zalo Công Việc",
         "url": "https://chat.zalo.me",
         "xpathConfig": {
           "selector": "",
           "mode": "badge_count",
           "pollIntervalMs": 3000
         },
         "desktopConfig": {
           "flashTaskbar": true,
           "showTaskbarBadge": true,
           "minimizeToTray": false,
           "showDesktopNotification": true,
           "createDesktopShortcut": true
         },
         "createdAt": "2026-09-12T10:00:00.000Z",
         "updatedAt": "2026-09-12T10:00:00.000Z"
       }
     ]
   }
   EOF
   ```

2. **Kiểm tra đọc cấu hình bằng bộ test tự động**:
   ```bash
   npm test tests/profile-manager.test.ts
   ```
   **Kết quả kỳ vọng**: Đọc thành công 2 profile, validate đúng định dạng schema.

3. **Kiểm tra chống ghi đè khi JSON hỏng (Corruption Resistance)**:
   - Sửa tệp `~/.config/zaloview/profiles.json` thành cú pháp lỗi: `{"schemaVersion": 1, "profiles": [INVALID_JSON`.
   - Chạy lệnh kiểm thử đọc cấu hình.
   **Kết quả kỳ vọng**: Hệ thống báo lỗi `ProfileRegistryCorruptError` và giữ nguyên nội dung tệp hỏng, không tạo lại danh sách rỗng.

---

### Kịch bản 2: Khởi chạy Hai Profile Song song & Cách ly Phiên (Session Isolation)

**Mục tiêu**: Đảm bảo mở 2 profile độc lập, hai phiên đăng nhập không trộn lẫn nhau.

1. **Khởi chạy Profile 1**:
   ```bash
   ./bin/zaloview.js --profile zalo-acc-1
   ```
   - Cửa sổ native mở ra, nạp `https://chat.zalo.me`.
   - Dữ liệu lưu tại `~/.local/share/zaloview/profiles/zalo-acc-1/`.

2. **Khởi chạy Profile 2 từ terminal thứ hai**:
   ```bash
   ./bin/zaloview.js --profile zalo-acc-2
   ```
   - Cửa sổ native thứ hai mở ra độc lập.
   - Dữ liệu lưu tại `~/.local/share/zaloview/profiles/zalo-acc-2/`.

3. **Xác minh cách ly**:
   - Tiến hành đăng nhập 2 tài khoản khác nhau trên 2 cửa sổ.
   - Xác nhận: Hai tài khoản hoạt động đồng thời, không bị đẩy tài khoản hay xung đột cookie.
   - Đóng cả hai cửa sổ và mở lại: Cả hai cửa sổ đều duy trì trạng thái đăng nhập thành công.

---

### Kịch bản 3: Kiểm tra Khóa Đơn phiên (Single-Instance per Profile)

**Mục tiêu**: Mở lại profile đang chạy sẽ khôi phục cửa sổ thay vì tạo tiến trình mới.

1. Đang mở `zalo-acc-1`, thu nhỏ cửa sổ xuống Taskbar.
2. Tại terminal, gõ lại lệnh:
   ```bash
   ./bin/zaloview.js --profile zalo-acc-1
   ```
3. **Kết quả kỳ vọng**:
   - Lệnh kết thúc ngay lập tức với mã thoát `0`.
   - Cửa sổ `zalo-acc-1` đang thu nhỏ tự động được phục hồi (restore), hiển thị lên trước và nhận tiêu điểm (focus).
   - Không có tiến trình hoặc cửa sổ trùng lặp nào được tạo thêm.

---

### Kịch bản 4: Kênh Điều khiển Cục bộ (Status & Graceful Shutdown)

**Mục tiêu**: Truy vấn trạng thái qua Unix domain socket và yêu cầu tắt an toàn.

1. Khi `zalo-acc-1` đang chạy, gửi lệnh truy vấn trạng thái qua socket bằng `socat` hoặc `nc`:
   ```bash
   # Tìm đường dẫn socket (ưu tiên XDG_RUNTIME_DIR hoặc userData)
   SOCKET_PATH="${XDG_RUNTIME_DIR:-~/.local/share/zaloview/profiles/zalo-acc-1}/zaloview/zalo-acc-1.sock"
   [ ! -S "$SOCKET_PATH" ] && SOCKET_PATH=~/.local/share/zaloview/profiles/zalo-acc-1/runner.sock

   # Gửi truy vấn status
   echo '{"requestId":"req-1","action":"status"}' | nc -U "$SOCKET_PATH"
   ```
   **Kết quả kỳ vọng**: Nhận về JSON chứa thông tin tiến trình (`pid`, `status: "running"`, `windowState`).

2. Gửi lệnh tắt an toàn:
   ```bash
   echo '{"requestId":"req-2","action":"shutdown"}' | nc -U "$SOCKET_PATH"
   ```
   **Kết quả kỳ vọng**:
   - Socket trả về phản hồi xác nhận.
   - Cửa sổ `zalo-acc-1` tự động đóng lại.
   - Tệp `window-state.json` được cập nhật tọa độ/kích thước mới nhất.
   - Tệp socket và khóa đơn phiên được giải phóng sạch sẽ.
