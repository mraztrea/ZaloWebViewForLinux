# Research: Khởi tạo dự án và Nền tảng phát triển (001-project-init)

Tài liệu nghiên cứu kỹ thuật và các quyết định kiến trúc cho Task 1 (Build, runtime và launcher cơ bản) theo yêu cầu tại [spec.md](spec.md) và các tài liệu chuẩn trong [docs/](../../docs).

---

## 1. Runtime Engine & Phiên bản Electron

- **Quyết định**: Chọn **Electron v44.x** (phiên bản ổn định hiện tại) kết hợp với **Node.js v22.x** (phù hợp với môi trường Linux Fedora 44 và Node v22.23.1 có sẵn trên máy phát triển).
- **Lý do**:
  - `docs/README.md` và `docs/detailed_tasks_plan.md` quy định rõ: *“Không sao chép Electron 29 hay các phiên bản mẫu cũ; chọn Electron stable còn được hỗ trợ, khóa dependency trong lockfile”*.
  - Electron 44 mang nhân Chromium và Node mới nhất, hỗ trợ đầy đủ Wayland native (`--ozone-platform-hint=auto` hoặc cờ Wayland), quản lý app ID và Desktop Entry chính xác trên Linux desktop hiện đại (KDE Plasma 6 / GNOME 4x).
  - Tương thích tự nhiên với Node 22 (LTS/current).
- **Các phương án thay thế đã đánh giá**:
  - *Electron 29*: Đã hết hạn hỗ trợ bảo mật (End of Life theo lịch trình Electron), Chromium cũ có thể gặp vấn đề bảo mật và tương thích với Zalo Web. Đã bị từ chối rõ ràng trong tài liệu kiến trúc.
  - *Tauri / WebKitGTK*: Tài liệu thiết kế đã chốt Electron vì cần tương thích với Chromium engine cho WebRTC, chia sẻ màn hình và clipboard của Zalo Web.

---

## 2. Công cụ đóng gói (Build Toolchain)

- **Quyết định**: Sử dụng **`esbuild`** thông qua kịch bản xây dựng tùy biến `scripts/build.mjs`.
- **Cấu hình đa mục tiêu (Multi-target build)**:
  1. **Main Process (`src/main/index.ts`)**:
     - Định dạng: CommonJS (`platform: 'node'`).
     - External: `['electron']`.
     - Đích ra: `dist/main/index.js`.
  2. **Preload Script (`src/preload/webview-preload.ts`, `src/preload/manager-preload.ts`)**:
     - Định dạng: CommonJS (`platform: 'node'`).
     - External: `['electron']`.
     - Đóng gói toàn bộ dependencies nội bộ thành một tệp duy nhất để chạy an toàn trong môi trường sandbox (`sandbox: true`) mà không gặp lỗi `exports is not defined` hoặc lỗi `require` ngoài ý muốn.
     - Đích ra: `dist/preload/webview-preload.js`.
  3. **Renderer UI (`src/renderer/manager/app.ts`)**:
     - Định dạng: ESM/IIFE (`platform: 'browser'`).
     - Hoàn toàn độc lập với Node.js, không dùng external `electron`.
     - Đích ra: `dist/renderer/manager/app.js`.
  4. **Sao chép tài nguyên tĩnh**:
     - Tự động sao chép các tệp `HTML`, `CSS`, icon từ `src/renderer` và `assets/` vào `dist/` mà không ghi đè lên các tệp `.js` đã biên dịch.
- **Lý do**:
  - Tốc độ đóng gói cực nhanh (< 100ms).
  - Cho phép tùy biến rõ ràng ranh giới rành mạch giữa 3 môi trường mà không cần cài đặt các plugin cồng kềnh.
  - Khắc phục triệt để lỗi mẫu cũ: tắt sandbox hoặc dùng `2>/dev/null` để nuốt lỗi.
- **Các phương án thay thế đã đánh giá**:
  - *Chỉ dùng `tsc`*: Không đóng gói các module phụ thuộc trong preload và renderer thành bundle độc lập, khiến Electron sandbox báo lỗi khi import tệp nội bộ.
  - *Vite / Webpack*: Quá phức tạp cho cấu trúc đa tiến trình của Electron, tạo ra cấu hình cồng kềnh không cần thiết.

---

## 3. Khung kiểm thử tự động (Test Framework)

- **Quyết định**: Sử dụng **`vitest`** kết hợp với môi trường `node` và `jsdom` (khi cần kiểm thử DOM/XPath ở Phase 2).
- **Lý do**:
  - Hỗ trợ TypeScript và ESM tự nhiên, không cần biên dịch trước để chạy test.
  - Tốc độ thực thi vượt trội so với Jest.
  - Cấu hình gọn gàng qua `vitest.config.ts`, tích hợp mượt mà với quy trình phát triển.
- **Các phương án thay thế đã đánh giá**:
  - *Jest*: Khởi động chậm hơn, yêu cầu cấu hình `ts-jest` phức tạp và dễ gặp lỗi xung đột ESM/CommonJS.
  - *Mocha*: Thiếu tính năng runner hiện đại và mock tích hợp sẵn.

---

## 4. Kiến trúc Script Launcher (`bin/zaloview.js`)

- **Quyết định**: Viết bằng Node.js với shebang `#!/usr/bin/env node`, cấp quyền thực thi (`chmod +x`).
- **Nguyên lý hoạt động**:
  1. Phân giải đường dẫn gốc của dự án (`appRoot`) dựa vào `import.meta.url` hoặc `__dirname` của chính tệp launcher, **không dùng `process.cwd()`**.
  2. Tìm binary Electron:
     - Chế độ phát triển: Phân giải tệp thực thi `electron` trong `node_modules/.bin/electron` của dự án.
     - Chế độ phân phối (sau này): Trỏ tới binary ứng dụng đã đóng gói.
  3. Khởi chạy tiến trình bằng `child_process.spawn`:
     ```javascript
     const child = spawn(electronPath, [appRoot, ...process.argv.slice(2)], {
       stdio: 'inherit',
       cwd: process.cwd() // giữ nguyên cwd của người gọi nếu cần ghi log/tệp
     });
     ```
  4. Lắng nghe `exit` và `signal` từ tiến trình con và thoát với đúng mã lỗi:
     ```javascript
     child.on('exit', (code, signal) => {
       if (signal) process.kill(process.pid, signal);
       else process.exit(code ?? 0);
     });
     ```
- **Lý do**:
  - Cho phép người dùng chạy launcher từ bất kỳ đâu (ví dụ `/tmp`, `~`) hoặc qua Desktop Entry shortcut mà không bị lỗi thiếu đường dẫn.
  - Truyền nguyên vẹn các tham số `--manager`, `--profile <id>` vào dispatcher dòng lệnh của ứng dụng.
  - Không biến lỗi khởi chạy thành mã thoát 0.
- **Các phương án thay thế đã đánh giá**:
  - *Bash shell script*: Khó xử lý khoảng trắng trong đường dẫn trên nhiều môi trường khác nhau, khó chia sẻ logic phân giải với code Node.

---

## 5. Cấu trúc TypeScript & Kiểm tra tĩnh

- **Quyết định**:
  - `tsconfig.json` áp dụng chế độ `strict: true`, `noImplicitAny: true`, `target: ES2022`, `moduleResolution: NodeNext`.
  - Định nghĩa script kiểm tra kiểu `npm run typecheck` thực hiện `tsc --noEmit`.
  - Phân tách các khai báo kiểu dùng chung vào `src/shared/types.ts` để tái sử dụng xuyên suốt main, preload và renderer.

---

## 6. Tổng hợp các quyết định kỹ thuật

| Thành phần | Công nghệ được chọn | Phiên bản khóa mục tiêu | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Runtime** | Electron | ^44.0.0 | Nhân Chromium mới nhất, hỗ trợ Wayland/X11 |
| **Nền tảng Node** | Node.js | >= 22.0.0 | Khớp với môi trường hệ thống |
| **Ngôn ngữ** | TypeScript | ^5.8.0 | Strict mode, noImplicitAny |
| **Bundler** | esbuild | ^0.25.0 | Đa mục tiêu Main, Preload, Renderer |
| **Test Runner** | Vitest | ^3.0.0 / ^5.0.0 | Hỗ trợ TypeScript native |
| **Launcher** | Node.js CLI Script | `bin/zaloview.js` | Thực thi độc lập, giữ cwd |
