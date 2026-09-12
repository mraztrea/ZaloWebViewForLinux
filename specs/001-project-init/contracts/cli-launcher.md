# Contract: CLI Launcher & Argument Dispatcher

Quy chuẩn giao diện và hành vi cho công cụ khởi chạy dòng lệnh `bin/zaloview.js` và bộ phân tích tham số `CommandLineParser`.

---

## 1. Cú pháp dòng lệnh (Invocation Syntax)

```bash
zaloview [--manager]
zaloview --profile <profile-id>
zaloview --help
zaloview --version
```

### Bảng tham số (Command-line Options)

| Tham số | Cờ rút gọn | Tham số phụ | Bắt buộc | Mô tả |
| :--- | :---: | :---: | :---: | :--- |
| `--manager` | `-m` | Không | Không | Mở giao diện bảng điều khiển quản lý (Dashboard). Mặc định nếu không truyền cờ nào. |
| `--profile` | `-p` | `<id>` | Không | Mở hoặc khôi phục cửa sổ runner của profile có định danh `<id>`. |
| `--help` | `-h` | Không | Không | In hướng dẫn sử dụng và thoát với mã 0. |
| `--version` | `-v` | Không | Không | In phiên bản ứng dụng và thoát với mã 0. |

---

## 2. Quy chuẩn phân giải đường dẫn và môi trường thực thi

1. **Độc lập với thư mục hiện tại (`process.cwd()`)**:
   - Launcher phải xác định thư mục gốc của ứng dụng theo:
     ```javascript
     const appRoot = path.resolve(__dirname, '..');
     ```
   - Cho dù người dùng đứng ở `/tmp`, `/home/user`, hay bất kỳ đâu, `appRoot` luôn trỏ chính xác về thư mục dự án ZaloWebView.
2. **Phân giải Electron Binary**:
   - Khi chạy ở chế độ phát triển:
     ```javascript
     const electronPath = path.join(appRoot, 'node_modules', '.bin', 'electron');
     ```
   - Kiểm tra tệp thực thi tồn tại. Nếu không tìm thấy, in thông báo lỗi chỉ dẫn chạy `npm install` và thoát với mã 1.
3. **Chuyển tiếp tiến trình (Process Spawning)**:
   - Sử dụng `child_process.spawn`:
     ```javascript
     const child = spawn(electronPath, [appRoot, ...args], {
       stdio: 'inherit',
       cwd: process.cwd()
     });
     ```
   - Chuyển tiếp toàn bộ tín hiệu POSIX (`SIGINT`, `SIGTERM`, `SIGHUP`) tới tiến trình con.
   - Khi tiến trình con kết thúc, tiến trình launcher phải thoát với mã tương ứng:
     - Nếu tiến trình con thoát do tín hiệu `SIGINT` (Ctrl+C), launcher kết thúc theo đúng tín hiệu đó.
     - Nếu có mã thoát số nguyên, launcher gọi `process.exit(code)`.

---

## 3. Quy chuẩn xử lý lỗi dòng lệnh (Error Handling & Exit Codes)

| Mã thoát | Điều kiện phát sinh | Hành vi xuất màn hình |
| :---: | :--- | :--- |
| **0** | Thành công bình thường, gọi `--help` hoặc `--version` | Xuất thông tin hướng dẫn hoặc kết thúc sạch |
| **1** | Cờ không hợp lệ, thiếu runtime, truyền sai định dạng | Xuất thông báo lỗi vào `stderr` |
| **2** | Xung đột tham số (truyền đồng thời cả `--manager` và `--profile`) | Xuất lỗi xung đột cờ vào `stderr` |
| **127** | Không tìm thấy nhị phân thực thi Electron hoặc tệp mục tiêu | Xuất lỗi runtime thiếu vào `stderr` |
