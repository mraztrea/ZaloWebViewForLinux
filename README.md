# ZaloWebView (Linux Webview Manager)

Trình quản lý phiên Webview độc lập chạy trên Linux, hỗ trợ nhiều website/profile với cơ chế theo dõi XPath, phát hiện thông báo và tích hợp shortcut hệ thống (KDE Plasma & GNOME).

---

## 1. Yêu cầu môi trường

- **Hệ điều hành**: Linux 64-bit (hỗ trợ Wayland và X11)
- **Node.js**: `>= 22.0.0`
- **NPM**: `>= 10.0.0`
- **Runtime**: Electron v44.3.0+

---

## 2. Cài đặt và Bắt đầu nhanh

```bash
# 1. Clone kho mã nguồn và cài đặt phụ thuộc
npm install

# 2. Kiểm tra kiểu tĩnh (TypeScript)
npm run typecheck

# 3. Biên dịch dự án (esbuild multi-target)
npm run build

# 4. Chạy bộ bài kiểm thử tự động
npm test
```

---

## 3. Khởi chạy ứng dụng qua CLI Launcher

Script launcher `bin/zaloview.js` có thể thực thi từ bất kỳ thư mục nào trên hệ thống:

```bash
# Mở giao diện quản lý (Manager Dashboard)
./bin/zaloview.js --manager

# Mở runner cho một profile cụ thể
./bin/zaloview.js --profile zalo

# Xem hướng dẫn sử dụng dòng lệnh
./bin/zaloview.js --help

# Xem phiên bản ứng dụng
./bin/zaloview.js --version
```

---

## 4. Tài liệu dự án

Các tài liệu thiết kế và lộ trình chi tiết được lưu trữ tại thư mục [`docs/`](docs/):

- [Tài liệu chuẩn & Rà soát](docs/README.md)
- [Đặc tả kỹ thuật chuẩn](docs/design_specification.md)
- [Lộ trình triển khai 5 phase](docs/phased_implementation_plan.md)
- [Kế hoạch chi tiết 8 task](docs/detailed_tasks_plan.md)
- [Yêu cầu ban đầu](docs/org_prompt.md)
