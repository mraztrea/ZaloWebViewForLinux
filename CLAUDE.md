# Claude Instructions - ZaloWebView

Hướng dẫn và quy tắc bắt buộc dành cho Claude Code khi làm việc trong dự án **ZaloWebView**.

---

## 1. QUY TẮC BẮT BUỘC: Khởi tạo Git Branch khi tạo Spec mới (Spec-Kit)

> [!IMPORTANT]
> **MỖI KHI BẮT ĐẦU 1 SPECIFY MỚI BẰNG SPECKIT SKILL (`speckit-specify`), BẮT BUỘC PHẢI KHỞI TẠO VÀ CHUYỂN SANG 1 GIT BRANCH MỚI.**
> Tuyệt đối không tạo spec hoặc phát triển tính năng trực tiếp trên branch `master`.

### Quy trình bắt buộc (Step-by-Step):
1. **Kiểm tra trạng thái repo**:
   ```bash
   git status
   ```
   Đảm bảo working directory sạch sẽ trước khi tạo nhánh mới.
2. **Checkout về `master` và cập nhật**:
   ```bash
   git checkout master
   git pull origin master
   ```
3. **Xác định tên branch mới**:
   - Định dạng: `<prefix>-<short-name>`
   - `<prefix>`: Số thứ tự 3 chữ số tiếp theo (ví dụ: `002`, tiếp theo `001-project-init`).
   - `<short-name>`: 2-4 từ ngắn gọn mô tả tính năng bằng tiếng Anh kebab-case (ví dụ: `002-window-state-mgmt`).
4. **Tạo và chuyển sang branch mới**:
   ```bash
   git checkout -b <prefix>-<short-name>
   ```
5. **Khởi tạo spec qua `speckit-specify`**:
   - Tạo thư mục tương ứng `specs/<prefix>-<short-name>/`.
   - Cập nhật file `.specify/feature.json` với `"feature_directory": "specs/<prefix>-<short-name>"`.
6. **Thực thi trên branch**:
   - Toàn bộ các giai đoạn kế tiếp (`speckit-clarify`, `speckit-plan`, `speckit-tasks`, `speckit-implement`, commit mã nguồn, chạy test) phải thực hiện trên branch feature này.

---

## 2. Tổng quan dự án & Tech Stack

- **Mục đích**: Linux Webview Manager cho các website/profile độc lập (Zalo, v.v.), tích hợp XPath watcher, desktop notifications và system shortcuts (Wayland/X11).
- **Runtime**: Node.js `>= 22.0.0`, Electron `>= 44.3.0`
- **Ngôn ngữ**: TypeScript
- **Bundler**: esbuild (`scripts/build.mjs`)
- **Test Runner**: Vitest

---

## 3. Các lệnh thường dùng

```bash
# Cài đặt dependencies
npm install

# Kiểm tra kiểu (TypeScript)
npm run typecheck

# Biên dịch ứng dụng
npm run build

# Chạy test suite
npm test

# Chạy Manager Dashboard
./bin/zaloview.js --manager

# Chạy Profile Runner
./bin/zaloview.js --profile <profile_id>
```

---

## 4. Hướng dẫn phát triển & Code Style

- **Spec-Kit Workflow**: Tuân thủ nghiêm ngặt quy trình `speckit-specify` -> `speckit-clarify` -> `speckit-plan` -> `speckit-tasks` -> `speckit-implement`.
- **YAGNI & Tối giản**: Không viết code đón đầu, không tạo abstraction thừa. Sử dụng API gốc của platform/Node.js thay vì thêm dependencies mới.
- **Xác thực trước khi hoàn thành**: Luôn chạy `npm run typecheck` và `npm test` để xác minh mọi thay đổi trước khi kết thúc tác vụ.
- **Tài liệu**: Duy trì và bảo toàn các tài liệu hiện có trong `docs/` và comment giải thích kiến trúc.
