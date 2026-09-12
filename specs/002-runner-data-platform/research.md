# Technical Research: Nền tảng Runner, Dữ liệu và Linux (Phase 0)

**Feature**: `002-runner-data-platform`
**Date**: 2026-09-12
**Status**: Completed

---

## 1. Cơ chế Single-Instance và Cách ly Dữ liệu Phiên trong Electron

### Bối cảnh
Hệ thống yêu cầu nhiều profile có thể chạy song song (ví dụ: mở đồng thời Profile Zalo 1 và Profile Zalo 2). Tuy nhiên, với cùng một profile, hệ thống phải đảm bảo tính duy nhất (single-instance): khi người dùng mở lại profile đó từ CLI hoặc launcher, cửa sổ hiện có sẽ được phục hồi và đưa lên tiêu điểm thay vì tạo thêm tiến trình/cửa sổ trùng lặp.

### Quyết định kỹ thuật
- Thiết lập đường dẫn `userData` riêng biệt cho từng instance trước khi gọi `app.requestSingleInstanceLock()`:
  - Manager: `$XDG_DATA_HOME/zaloview/manager`
  - Runner theo profile: `$XDG_DATA_HOME/zaloview/profiles/<profileId>`
- Thiết lập `sessionData` tương ứng và tạo session partition độc lập: `session.fromPartition('persist:zaloview_' + profileId)`.
- Khi `app.requestSingleInstanceLock()` trả về `false`, tiến trình runner mới lập tức thoát với mã `0`.
- Khi sự kiện `second-instance` được kích hoạt trên tiến trình đang chạy, kiểm tra nếu cửa sổ đang thu nhỏ (`win.isMinimized()`) thì gọi `win.restore()`, sau đó gọi `win.show()` và `win.focus()`.

### Lý do lựa chọn
- Electron quản lý cơ chế khóa đơn phiên dựa trên khóa tệp (file lock / socket) nằm trong thư mục `userData`. Nếu tất cả các profile dùng chung `userData`, Electron sẽ coi mọi profile là cùng một ứng dụng và chặn không cho mở 2 profile cùng lúc.
- Ngược lại, nếu không chia `userData`, các tiến trình Chromium chạy song song sẽ xung đột ghi đè tệp cơ sở dữ liệu IndexedDB, Cookies và LocalStorage.
- Việc chia tách `userData` triệt để theo từng profile vừa giải quyết hoàn hảo bài toán single-instance theo từng profile, vừa đảm bảo tính cô lập dữ liệu 100%.

### Các phương án thay thế đã xem xét và loại bỏ
- **Dùng một tiến trình Main duy nhất quản lý tất cả các cửa sổ profile**: Bị loại bỏ vì nếu một website làm crash tiến trình Main, toàn bộ các profile khác sẽ bị sập theo; đồng thời việc gán danh tính Linux (WM_CLASS, Wayland app_id) và badge taskbar riêng biệt cho từng profile sẽ trở nên bất khả thi do Electron quản lý badge và desktop name ở cấp độ Application.
- **Sử dụng `additionalData` làm khóa tùy biến**: Bị loại bỏ vì `additionalData` chỉ là dữ liệu đính kèm truyền qua socket cho instance đầu tiên, không thể thay đổi phạm vi kiểm tra khóa của Electron.

---

## 2. Ghi Cấu hình Nguyên tử (Atomic Write) và Khả năng Kháng Lỗi Hỏng Dữ liệu

### Bối cảnh
Tệp cấu hình danh sách profile (`profiles.json`) và tệp trạng thái cửa sổ (`window-state.json`) là các tệp dữ liệu trọng yếu. Nếu máy tính bị mất điện đột ngột hoặc tiến trình bị tắt ngang lúc đang ghi, tệp có thể bị cắt cụt (truncated) hoặc hư hại cú pháp JSON.

### Quyết định kỹ thuật
- Áp dụng kỹ thuật ghi tệp nguyên tử (Atomic File Write):
  1. Ghi dữ liệu vào tệp tạm thời trong cùng thư mục: `<targetFile>.tmp.<pid>.<timestamp>`.
  2. Đồng bộ dữ liệu xuống đĩa vật lý (`fs.fsyncSync`).
  3. Sử dụng thao tác đổi tên nguyên tử của hệ điều hành POSIX (`fs.renameSync`) để ghi đè tệp đích.
  4. Phân quyền tệp riêng tư `0600` (chỉ user hiện tại có quyền đọc/ghi) và thư mục `0700`.
- Cơ chế bảo toàn khi gặp lỗi:
  - Khi đọc `profiles.json`, nếu tệp không tồn tại -> coi là trạng thái khởi tạo hợp lệ (danh sách rỗng).
  - Nếu tệp tồn tại nhưng lỗi cú pháp JSON hoặc sai `schemaVersion` -> ném ngoại lệ có thể hành động (`ProfileRegistryCorruptError`), **tuyệt đối không** tự động khởi tạo danh sách rỗng rồi ghi đè làm mất dữ liệu của người dùng.
  - Phân định rõ quyền ghi: Chỉ Manager được phép ghi vào `profiles.json`. Runner chỉ đọc bản snapshot cấu hình khi khởi động và chỉ ghi tệp `window-state.json` riêng của chính nó khi đóng/thay đổi kích thước.

### Lý do lựa chọn
- `fs.renameSync` trên hệ thống Linux POSIX là một thao tác nguyên tử (atomic operation) ở cấp độ filesystem (ext4, btrfs, xfs). Tệp đích hoặc là nguyên vẹn ở phiên bản cũ, hoặc chuyển hoàn toàn sang phiên bản mới, không bao giờ rơi vào trạng thái dở dang.
- Việc runner không ghi lại `profiles.json` lúc đóng loại bỏ hoàn toàn race-condition: tránh trường hợp người dùng sửa tên/cấu hình từ bên ngoài, sau đó runner cũ đóng lại ghi đè snapshot cũ làm mất thông tin vừa sửa.

### Các phương án thay thế đã xem xét và loại bỏ
- `fs.writeFileSync` trực tiếp: Bị loại bỏ vì nếu tiến trình bị kill giữa chừng, tệp sẽ có kích thước 0 byte hoặc bị mất dữ liệu.
- Sử dụng cơ sở dữ liệu nhúng (SQLite): Bị loại bỏ vì vi phạm nguyên tắc YAGNI/Simplicity; tệp JSON cấu hình nhỏ nhẹ, dễ đọc/sao lưu thủ công và không cần các dependency native phức tạp.

---

## 3. Định danh Cửa sổ Linux (WM_CLASS & Wayland App ID)

### Bối cảnh
Trên môi trường Linux (X11 và Wayland), hệ điều hành gom nhóm cửa sổ trên taskbar/dock và gán biểu tượng ứng dụng dựa trên `WM_CLASS` (đối với X11) hoặc `app_id` (đối với Wayland). Nếu không cấu hình định danh đúng, tất cả các profile sẽ bị gom chung vào biểu tượng "Electron" mặc định.

### Quyết định kỹ thuật
- Thiết lập định danh ứng dụng trước khi tạo cửa sổ thông qua API chính thức của Electron:
  ```typescript
  app.setDesktopName(`zaloview-${profileId}.desktop`);
  ```
- Quy ước đặt tên tệp desktop entry đồng bộ: `zaloview-<profileId>.desktop` nằm trong `$XDG_DATA_HOME/applications/`.
- Không sử dụng các thuộc tính không có trong định nghĩa kiểu TypeScript của Electron (ví dụ: `wmClass` hay `appId` trực tiếp trong `BrowserWindowConstructorOptions`) và không dùng `@ts-ignore`.

### Lý do lựa chọn
- Mã nguồn nội bộ của Electron trên Linux (`shell/browser/native_window_views.cc`) sử dụng giá trị `desktopName` để đăng ký `StartupWMClass` trên X11 và đặt `app_id` trên Wayland compositor.
- Sử dụng API công khai chuẩn hóa của Electron giúp mã nguồn biên dịch sạch (`npm run typecheck`), tương thích ổn định qua các phiên bản runtime và không phụ thuộc vào hack ngầm.

---

## 4. Kênh Giao tiếp Cục bộ (Local Unix Domain Socket Control Channel)

### Bối cảnh
Manager và các công cụ dòng lệnh cần giao tiếp với runner đang chạy để:
1. Truy vấn trạng thái hoạt động (`status`: đang tải, đang chạy, lỗi).
2. Yêu cầu tắt runner an toàn (`shutdown`) trước khi xóa profile hoặc đăng xuất.

### Quyết định kỹ thuật
- Sử dụng **Unix Domain Socket** (`node:net` IPC server) cho từng runner:
  - Đường dẫn ưu tiên: `$XDG_RUNTIME_DIR/zaloview/<profileId>.sock` (nếu `$XDG_RUNTIME_DIR` hợp lệ và độ dài đường dẫn <= 104 ký tự).
  - Đường dẫn dự phòng: `$userData/runner.sock`.
  - Phân quyền tệp socket: `0600`, thư mục chứa `0700`.
- Giao thức thông điệp (Wire Protocol):
  - Dữ liệu dạng dòng phân cách bởi ký tự xuống dòng (`\n`).
  - Định dạng JSON chuẩn: mỗi gói tin chứa `requestId`, `action`, `payload`.
  - Giới hạn kích thước gói tin: tối đa 64 KiB để phòng ngừa tấn công làm tràn bộ nhớ.
  - Thời gian chờ phản hồi (timeout): mặc định 5.0 giây.
- Quản lý tệp Socket mồ côi (Stale Socket Handling):
  - Khi runner khởi động, nếu thấy tệp `.sock` đã tồn tại: tiến hành thử kết nối (`net.connect`).
  - Nếu kết nối thành công: có một runner khác đang thực sự chạy -> thoát hoặc báo lỗi.
  - Nếu kết nối bị từ chối (`ECONNREFUSED`) hoặc timeout: đây là socket mồ côi từ phiên trước bị sập đột ngột -> an toàn xóa tệp (`fs.unlinkSync`) và khởi tạo socket server mới.

### Lý do lựa chọn
- Unix domain socket chạy hoàn toàn trong nhân Linux, hiệu năng cực cao (độ trễ < 1ms), không chiếm dụng cổng mạng TCP (tránh xung đột port), không thể bị truy cập từ bên ngoài mạng internet, và cho phép phân quyền bằng quyền tệp tin hệ thống chuẩn.

---

## 5. Chính sách Bảo mật và Quản lý Quyền Truy cập Thiết bị

### Bối cảnh
Cửa sổ runner tải nội dung từ website bên ngoài (ví dụ Zalo Web). Cần bảo vệ an toàn cho hệ thống máy tính của người dùng và ngăn chặn nội dung web tùy tiện truy cập camera/microphone hoặc thực thi mã độc.

### Quyết định kỹ thuật
- Ranh giới bảo mật Electron:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`
  - `webSecurity: true`
  - Giữ nguyên cơ chế kiểm tra chứng chỉ SSL/TLS mặc định.
- Quản lý quyền thiết bị (Camera, Microphone, Clipboard, Notifications):
  - Thiết lập cả hai trình xử lý: `session.setPermissionCheckHandler` và `session.setPermissionRequestHandler`.
  - Mặc định từ chối tất cả các yêu cầu không nằm trong danh sách cho phép.
  - Quyền camera và microphone phải được kiểm tra theo từng `origin` (URL gốc của website).
  - Quyết định cấp quyền được lưu trữ riêng trong tệp `permissions.json` thuộc thư mục dữ liệu của profile, cho phép người dùng thu hồi sau này.
  - Khi người dùng từ chối quyền mic/camera, giao diện web nhận thông báo lỗi quyền từ trình duyệt và tiếp tục hoạt động với các tính năng nhắn tin văn bản mà không bị crash.
- Kiểm soát điều hướng (Navigation Safeguard):
  - Lắng nghe sự kiện `will-navigate`: Chỉ cho phép điều hướng trong phạm vi origin đã được phê duyệt.
  - Thiết lập `setWindowOpenHandler`: Chặn việc tạo cửa sổ con tùy tiện; các liên kết ngoại vi được mở qua trình duyệt mặc định của hệ điều hành (`shell.openExternal`).

---

## 6. Ghi nhớ Trạng thái Cửa sổ và Tương thích Đa màn hình

### Bối cảnh
Người dùng mong muốn cửa sổ mở lại đúng vị trí, kích thước và trạng thái phóng to trước đó. Tuy nhiên, nếu người dùng từng sử dụng màn hình phụ rồi ngắt kết nối, tọa độ cũ có thể khiến cửa sổ bị "lạc" ra ngoài vùng hiển thị của màn hình hiện có.

### Quyết định kỹ thuật
- Lưu trữ trạng thái trong `window-state.json`:
  ```json
  {
    "x": 100,
    "y": 100,
    "width": 1024,
    "height": 768,
    "isMaximized": false
  }
  ```
- Cơ chế ghi nhận:
  - Lắng nghe sự kiện `resize` và `move` có kỹ thuật debounce (300ms) để không ghi đĩa liên tục khi người dùng đang kéo chuột.
  - Khi cửa sổ ở trạng thái `maximized`, **không** ghi đè kích thước toàn màn hình vào `width`/`height` bình thường, mà chỉ cập nhật cờ `isMaximized: true`.
- Khôi phục an toàn:
  - Trước khi áp dụng tọa độ `x`, `y`, duyệt danh sách màn hình khả dụng qua `screen.getAllDisplays()`.
  - Kiểm tra xem hình chữ nhật của cửa sổ có giao cắt với bất kỳ màn hình nào không.
  - Nếu cửa sổ nằm ngoài toàn bộ các màn hình hiển thị: tự động đưa tọa độ về trung tâm của màn hình chính (`screen.getPrimaryDisplay()`).
  - Áp dụng kích thước chuẩn trước, sau đó nếu `isMaximized: true` thì mới gọi `win.maximize()`.
