# Contract: NPM Lifecycle Scripts

Quy chuẩn các lệnh vòng đời trong `package.json` đảm bảo kiểm tra tự động và khởi động môi trường.

---

## 1. Danh sách lệnh chuẩn (Standard Scripts)

| Lệnh | Câu lệnh thực thi | Mục đích | Điều kiện thành công |
| :--- | :--- | :--- | :--- |
| `npm run typecheck` | `tsc --noEmit` | Kiểm tra tính hợp lệ của kiểu dữ liệu tĩnh toàn dự án | Mã thoát 0, không có bất kỳ lỗi TypeScript nào |
| `npm run build` | `node scripts/build.mjs` | Biên dịch toàn bộ các mục tiêu và sao chép tài nguyên | Mã thoát 0, thư mục `dist/` chứa đủ bundle |
| `npm test` | `vitest run` | Chạy toàn bộ các bộ bài kiểm thử đơn vị và tích hợp | Mã thoát 0, 100% bài kiểm thử đạt |
| `npm run prestart` | `npm run build` | Tự động biên dịch trước khi khởi chạy ứng dụng | Mã thoát 0 |
| `npm start` | `electron .` | Khởi động ứng dụng phát triển với dispatcher mặc định | Chuyển tiếp tham số tới runtime |

---

## 2. Quy tắc thực thi không cố định tham số (Argument Preservation)

1. `npm start` **KHÔNG ĐƯỢC** cố định cứng cờ `--manager`.
2. Mọi tham số dòng lệnh do người dùng truyền vào sau `--` (ví dụ: `npm start -- --profile zalo`) phải được chuyển thẳng tới entry point chính của Electron mà không bị lọc bỏ hay can thiệp.
