# Contract: Build Pipeline & Security Sandbox

Quy chuẩn đầu vào, đầu ra và cơ chế đóng gói bảo mật cho kịch bản biên dịch `scripts/build.mjs`.

---

## 1. Cấu trúc thư mục Nguồn và Đích (Source & Distribution Layout)

```text
src/
├── main/
│   └── index.ts                 --> dist/main/index.js (CJS, Node, electron external)
├── preload/
│   └── webview-preload.ts       --> dist/preload/webview-preload.js (CJS, Bundle, electron external)
│   └── manager-preload.ts       --> dist/preload/manager-preload.js (CJS, Bundle, electron external)
├── renderer/
│   └── manager/
│       ├── index.html           --> dist/renderer/manager/index.html (Copy)
│       ├── styles.css           --> dist/renderer/manager/styles.css (Copy)
│       └── app.ts               --> dist/renderer/manager/app.js (Browser Bundle, IIFE/ESM)
└── assets/                      --> dist/assets/ (Copy tĩnh các icon và ảnh)
```

---

## 2. Tiêu chuẩn biên dịch từng phân vùng (Target Compilation Standards)

### A. Main Process Target (`dist/main/index.js`)
- `platform`: `'node'`
- `format`: `'cjs'`
- `bundle`: `true`
- `external`: `['electron']`
- `target`: `'node22'`
- `sourcemap`: `true`

### B. Preload Target (`dist/preload/*.js`)
- `platform`: `'node'`
- `format`: `'cjs'`
- `bundle`: `true`
- `external`: `['electron']`
- **Ranh giới bảo mật Sandbox**:
  - Preload chạy trong bối cảnh phân lập (`contextIsolation: true`, `sandbox: true`).
  - Toàn bộ module phụ thuộc nội bộ phải được nén gộp vào bundle để trình duyệt không gọi `require()` các tệp riêng rẽ trong lúc nạp.
  - Không được rò rỉ các hàm tạo global độc quyền hoặc polyfill gây xung đột môi trường web.

### C. Renderer Target (`dist/renderer/**/*.js`)
- `platform`: `'browser'`
- `format`: `'iife'` hoặc `'esm'`
- `bundle`: `true`
- `external`: `[]` (Tuyệt đối không import `electron` hay module Node hệ thống)
- `target`: `'chrome130'` (hoặc nhân Chromium tương ứng Electron 44)

---

## 3. Quy chuẩn xử lý lỗi biên dịch

1. Kịch bản biên dịch **KHÔNG ĐƯỢC** sử dụng các kỹ thuật chuyển hướng nuốt lỗi (ví dụ `2>/dev/null` hay `catch () {}` rỗng).
2. Khi bất kỳ mục tiêu nào (main, preload, renderer, asset copy) gặp lỗi, kịch bản phải in báo cáo chi tiết vị trí tệp lỗi và kết thúc ngay lập tức với mã lỗi khác 0 (`process.exit(1)`).
3. Đảm bảo dọn dẹp và ghi đè an toàn, không để sót các tệp artifact bị lỗi một phần.
