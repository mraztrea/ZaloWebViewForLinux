# Interface Contract: Kênh Điều khiển Runner Cục bộ (Runner Control Socket)

**Tệp**: `specs/002-runner-data-platform/contracts/runner-control-socket.md`
**Phạm vi**: Main Process — `src/main/runner-control.ts`

---

## 1. Giao thức Tầng Truyền dẫn (Transport Layer)

- **Cơ chế**: Unix Domain Socket cục bộ (stream socket, `AF_UNIX`).
- **Đường dẫn Socket**:
  - Ưu tiên: `$XDG_RUNTIME_DIR/zaloview/<profileId>.sock` (nếu `$XDG_RUNTIME_DIR` được thiết lập hợp lệ và đường dẫn <= 104 ký tự).
  - Dự phòng: `$XDG_DATA_HOME/zaloview/profiles/<profileId>/runner.sock`.
- **Phân quyền hệ thống tệp**:
  - Thư mục chứa: Chế độ `0700` (`rwx------`).
  - Tệp socket: Chế độ `0600` (`rw-------`).
- **Định dạng đóng gói thông điệp**:
  - Mỗi thông điệp là một chuỗi JSON hợp lệ được kết thúc bằng ký tự xuống dòng `\n` (Line-delimited JSON).
  - Giới hạn kích thước bộ đệm cho một thông điệp: 65,536 bytes (64 KiB). Nếu dữ liệu nhận được vượt quá 64 KiB trước khi gặp `\n`, socket server lập tức ngắt kết nối và trả về lỗi `PAYLOAD_TOO_LARGE`.

---

## 2. Cấu trúc Thông điệp Yêu cầu và Phản hồi

### 2.1. Yêu cầu (Request Schema)

```json
{
  "requestId": "string (bắt buộc, UUID hoặc chuỗi ngẫu nhiên duy nhất)",
  "action": "status | shutdown",
  "params": {}
}
```

### 2.2. Phản hồi Thành công (Success Response Schema)

```json
{
  "requestId": "string (khớp với requestId của request)",
  "success": true,
  "data": {}
}
```

### 2.3. Phản hồi Thất bại (Error Response Schema)

```json
{
  "requestId": "string (khớp với requestId của request)",
  "success": false,
  "error": "Mô tả chi tiết nguyên nhân lỗi"
}
```

---

## 3. Danh mục Lệnh (Supported Actions)

### 3.1. Lệnh `status`
- **Mô tả**: Truy vấn trạng thái hoạt động hiện tại của runner.
- **Tham số (`params`)**: Không có.
- **Dữ liệu trả về (`data`)**:
  ```json
  {
    "status": "running",
    "profileId": "zalo-work",
    "url": "https://chat.zalo.me",
    "pid": 12345,
    "uptimeSeconds": 3600,
    "windowState": {
      "x": 100,
      "y": 100,
      "width": 1024,
      "height": 768,
      "isMaximized": false
    }
  }
  ```

### 3.2. Lệnh `shutdown`
- **Mô tả**: Yêu cầu runner thực hiện lưu dữ liệu và tắt tiến trình một cách an toàn.
- **Tham số (`params`)**: Không có.
- **Dữ liệu trả về (`data`)**:
  ```json
  {
    "acknowledged": true,
    "message": "Runner đang tiến hành đóng cửa sổ và giải phóng tài nguyên"
  }
  ```
- **Hành vi sau khi phản hồi**:
  1. Runner gửi phản hồi thành công qua socket.
  2. Kích hoạt quy trình đóng cửa sổ (`win.close()`).
  3. Đảm bảo trạng thái cửa sổ được lưu (`saveWindowState`).
  4. Đóng Unix domain socket server và gỡ tệp `.sock`.
  5. Thoát tiến trình Electron (`app.quit()`).

---

## 4. Xử lý Socket Mồ côi (Stale Socket Recovery)

Khi Runner khởi động:
1. Kiểm tra sự tồn tại của tệp `.sock` trên đĩa.
2. Nếu tệp tồn tại, Runner tạo kết nối thử nghiệm (`net.connect(socketPath)`):
   - **Trường hợp A (Kết nối thành công)**: Một tiến trình runner khác đang thực sự chạy. Runner mới ghi nhận có phiên trùng lặp và thoát.
   - **Trường hợp B (Nhận lỗi `ECONNREFUSED` hoặc timeout sau 1000ms)**: Đây là tệp socket mồ côi từ một tiến trình bị crash trước đó.
     - Runner mới thực hiện xóa tệp mồ côi: `fs.unlinkSync(socketPath)`.
     - Tiếp tục khởi tạo socket server mới.
