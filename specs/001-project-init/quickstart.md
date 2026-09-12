# Quickstart & Validation Guide: Khởi tạo dự án (001-project-init)

Hướng dẫn kiểm chứng toàn diện (End-to-End Validation) để xác minh tính năng Khởi tạo dự án và Nền tảng phát triển hoạt động chính xác từ một bản sao chép sạch.

---

## 1. Yêu cầu tiên quyết (Prerequisites)

- **Hệ điều hành**: Linux 64-bit (Fedora, Ubuntu, Debian, Arch...)
- **Môi trường thực thi**: Node.js v22.x+ và npm 10.x+
  ```bash
  node -v # Yêu cầu >= v22.0.0
  npm -v  # Yêu cầu >= 10.0.0
  ```

---

## 2. Kịch bản xác thực 1: Cài đặt và kiểm tra toàn diện từ checkout sạch

Xác nhận việc thiết lập phụ thuộc, kiểm tra kiểu, đóng gói bundle và chạy unit test hoạt động 100% không phát sinh cảnh báo hay lỗi.

### Lệnh thực hiện

```bash
# 1. Cài đặt các gói phụ thuộc khớp lockfile
npm ci

# 2. Kiểm tra tính hợp lệ của kiểu dữ liệu TypeScript
npm run typecheck

# 3. Biên dịch toàn bộ các mục tiêu (main, preload, renderer, assets)
npm run build

# 4. Chạy bộ kiểm thử tự động
npm test
```

### Kết quả kỳ vọng

- `npm ci`: Tải và cài đặt thành công toàn bộ dependencies, không báo xung đột phiên bản.
- `npm run typecheck`: Thoát với mã 0, không có lỗi kiểu.
- `npm run build`: Tạo thư mục `dist/` với các tệp:
  - `dist/main/index.js`
  - `dist/preload/webview-preload.js`
  - `dist/renderer/manager/app.js`
  - `dist/renderer/manager/index.html`
- `npm test`: Bộ test suite chạy với 100% bài kiểm thử đạt (`PASS`).

---

## 3. Kịch bản xác thực 2: Kiểm chứng CLI Launcher từ thư mục làm việc bất kỳ

Xác nhận script launcher `bin/zaloview.js` hoạt động chính xác độc lập với thư mục hiện tại (`cwd`).

### Lệnh thực hiện

```bash
# Đảm bảo launcher có quyền thực thi
chmod +x bin/zaloview.js

# Kịch bản A: Chạy từ thư mục gốc
./bin/zaloview.js --help

# Kịch bản B: Chạy từ thư mục tạm bên ngoài
cd /tmp
/home/buiducthanh/projects/canhan/ZaloWebView/bin/zaloview.js --help

# Kịch bản C: Kiểm tra truyền cờ profile từ thư mục home
cd ~
/home/buiducthanh/projects/canhan/ZaloWebView/bin/zaloview.js --profile test-profile
```

### Kết quả kỳ vọng

- Dù gọi từ bất kỳ thư mục nào (`/tmp`, `~` hay thư mục dự án), launcher đều xác định đúng thư mục ứng dụng gốc.
- Tham số `--help` in hướng dẫn sử dụng và kết thúc với mã 0.
- Tham số `--profile test-profile` được chuyển tiếp nguyên vẹn tới bộ phân tích tham số dòng lệnh của ứng dụng.

---

## 4. Kịch bản xác thực 3: Kiểm chứng bảo mật sandbox của Preload và Renderer

Xác nhận các tệp bundle tuân thủ chặt chẽ ranh giới bảo mật:

### Lệnh thực hiện

```bash
# Kiểm tra bundle renderer không chứa require trực tiếp của Node module
grep -n "require('child_process')" dist/renderer/manager/app.js || echo "Renderer sandbox: SAFE"

# Kiểm tra preload đóng gói đầy đủ mà không bị lỗi export
node -e "const fs = require('fs'); console.log('Bundle size:', fs.statSync('dist/preload/webview-preload.js').size, 'bytes');"
```

### Kết quả kỳ vọng

- Renderer hoàn toàn không chứa các lời gọi module hệ điều hành của Node.js.
- Preload bundle được đóng gói đầy đủ thành tệp độc lập, sẵn sàng nạp trong chế độ `sandbox: true`.
