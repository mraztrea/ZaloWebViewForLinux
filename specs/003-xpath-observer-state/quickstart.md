# Quickstart Guide: Kiểm thử và Xác minh Tính năng XPath Observer (Phase 2)

**Branch**: `003-xpath-observer-state` | **Date**: 2026-09-12 | **Spec**: [spec.md](./spec.md)

Tài liệu này hướng dẫn các kịch bản kiểm thử thực tế và lệnh vận hành để xác minh toàn bộ các tính năng thuộc Phase 2 (Task 4): Đánh giá XPath, trích xuất dữ liệu, cơ chế quan sát DOM, so sánh baseline và kiểm tra selector thủ công.

---

## 1. Môi trường và Điều kiện Tiên quyết

1. Node.js `>= 22.0.0`, npm `>= 10.0.0`.
2. Kho mã nguồn đang ở branch `003-xpath-observer-state`.
3. Toàn bộ phụ thuộc đã cài đặt:
   ```bash
   npm install
   ```

---

## 2. Kịch bản 1: Kiểm thử Đơn vị Toàn diện cho `XPathEvaluator`

Kiểm tra tính đúng đắn của logic trích xuất 3 chế độ (`existence`, `badge_count`, `text_content`), cơ chế xử lý lỗi selector vô hướng, dữ liệu không hợp lệ và thuật toán so sánh baseline.

### Lệnh thực thi:
```bash
npx vitest run tests/xpath-evaluator.test.ts
```

### Tiêu chí nghiệm thu kỳ vọng:
1. `existence`:
   - Trả về `hasElement: true` khi node xuất hiện.
   - Phát hiện chuyển trạng thái `false → true` (`changedForAlert: true`).
   - Đổi text bên trong node không tạo cảnh báo lặp lại (`changedForAlert: false`).
2. `badge_count`:
   - Parse chính xác `3`, `0`, `99+` (trả về 99).
   - Phân loại lỗi `invalid_data` đối với `abc`, `-1`, `1.5`, không đoán thành 1.
   - Chuỗi đếm `5 → 3 → 4`: Bắt đúng lần tăng cuối `3 → 4` (`changedForAlert: true`), bước `5 → 3` chỉ cập nhật baseline (`changedForAlert: false`).
3. `text_content`:
   - Chuỗi rỗng không tạo cảnh báo.
   - So sánh đầy đủ hai chuỗi dài hơn 500 ký tự chỉ khác nhau ở cuối.
4. Lỗi cú pháp / Scalar:
   - `count(//div)` hoặc cú pháp lỗi trả về `invalid_selector`.
   - Node không tồn tại trả về `no_match`.

---

## 3. Kịch bản 2: Kiểm thử Tích hợp Kênh IPC và Runner Socket `test-xpath`

Kiểm tra việc tích hợp socket điều khiển runner với hành động `test-xpath`, cơ chế chuyển tiếp IPC giữa Main và Preload, xử lý timeout và navigation.

### Lệnh thực thi:
```bash
npx vitest run tests/runner-control-xpath.test.ts
```

### Tiêu chí nghiệm thu kỳ vọng:
1. Gửi lệnh `test-xpath` qua Unix domain socket nhận được kết quả `match`/`no_match`/`invalid_selector` chính xác.
2. Quá trình kiểm tra thủ công không làm thay đổi baseline của observer tự động và không kích hoạt cảnh báo thông báo.
3. Timeout 5000 ms hoạt động khi tài liệu không phản hồi.
4. Điều hướng (navigation) trong lúc test tự động hủy yêu cầu an toàn.

---

## 4. Kịch bản 3: Thử nghiệm Thực tế trên Cửa sổ Runner (`zalo` Profile)

Xác minh hoạt động thực tế trên cửa sổ Electron với trang web Zalo Web hoặc trang HTML fixture.

### 1. Khởi chạy Profile Runner:
```bash
./bin/zaloview.js --profile zalo
```

### 2. Mở một terminal thứ hai để gửi lệnh kiểm tra XPath qua Socket:
*(Sử dụng script tiện ích hoặc `socat` / `nc -U` gửi JSON tới đường dẫn socket)*

Ví dụ gửi qua socket:
```bash
SOCKET_PATH="$XDG_RUNTIME_DIR/zaloview/zalo.sock"
[ -S "$SOCKET_PATH" ] || SOCKET_PATH="$HOME/.local/share/zaloview/profiles/zalo/runner.sock"

echo '{"requestId":"test-01","action":"test-xpath","params":{"selector":"//body","mode":"existence"}}' | nc -U "$SOCKET_PATH"
```

### Phản hồi kỳ vọng:
```json
{"requestId":"test-01","success":true,"data":{"status":"match","selector":"//body","mode":"existence","hasElement":true,"count":0,"textPreview":"...","executionTimeMs":12}}
```

---

## 5. Kiểm tra Chuẩn Mã Nguồn và Biên dịch

Trước khi hoàn tất tính năng, đảm bảo toàn bộ mã nguồn tuân thủ chặt chẽ các tiêu chuẩn kỹ thuật:

```bash
# 1. Kiểm tra kiểu TypeScript (Strict mode)
npm run typecheck

# 2. Biên dịch đa đích esbuild (Main, Preload, Renderer)
npm run build

# 3. Chạy toàn bộ test suite
npm test
```
