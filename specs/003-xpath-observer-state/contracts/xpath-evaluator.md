# Interface Contract: Bộ trích xuất & Đánh giá XPath (`XPathEvaluator`)

**Tệp**: `specs/003-xpath-observer-state/contracts/xpath-evaluator.md`
**Phạm vi**: Preload Script & DOM Engine — `src/preload/xpath-evaluator.ts`

---

## 1. Mục đích

Module `xpath-evaluator.ts` là module thuần DOM chạy trong ngữ cảnh Preload/Webview, chịu trách nhiệm:
1. Đánh giá chuỗi XPath trên tài liệu HTML (`document.evaluate`).
2. Trích xuất giá trị theo 3 chế độ (`existence`, `badge_count`, `text_content`).
3. So sánh trạng thái với baseline để xác định có thay đổi kích hoạt cảnh báo (`changedForAlert`) hay không.
4. Quản lý hiển thị lớp phủ nhận diện trực quan (highlight overlay) tạm thời khi chạy thử nghiệm.

---

## 2. Các hàm và Giao diện Xuất bản (Exported API)

```typescript
import {
  XPathObservationMode,
  XPathEvaluationResult,
  XPathObservationState,
  XPathBaselineRecord
} from '../shared/types';

/**
 * Đánh giá một selector XPath trên tài liệu DOM hiện tại
 */
export function evaluateXPath(
  doc: Document,
  selector: string,
  mode: XPathObservationMode
): XPathEvaluationResult;

/**
 * So sánh mẫu trạng thái hiện tại với baseline mẫu trước để tính toán changedForAlert và cập nhật baseline
 */
export function compareWithBaseline(
  currentResult: XPathEvaluationResult,
  baseline: XPathBaselineRecord
): {
  state: XPathObservationState;
  newBaseline: XPathBaselineRecord;
};

/**
 * Hiển thị lớp viền/nền nhận diện tạm thời trên Node phần tử được tìm thấy
 * Tự động xóa sau durationMs (mặc định 1500 ms)
 */
export function highlightElement(
  element: Element,
  durationMs?: number
): void;
```

---

## 3. Chi tiết Xử lý Phân tích Cú pháp (Parsing Rules)

### 3.1. `parseBadgeCount(rawText: string): { count: number; isValid: boolean }`
- Loại bỏ khoảng trắng 2 đầu: `rawText.trim()`.
- Kiểm tra chuỗi rỗng: Nếu chuỗi rỗng → `isValid: false`.
- Khớp regex: `/^(\d+)(\+)?$/`.
- Nếu khớp:
  - Lấy phần chữ số `Number(match[1])`.
  - Nếu `count <= Number.MAX_SAFE_INTEGER` → `{ count, isValid: true }`.
  - Ngược lại → `{ count: 0, isValid: false }`.
- Nếu không khớp (ví dụ `"-1"`, `"1.5"`, `"abc"`, `"Tin nhắn mới"`) → `{ count: 0, isValid: false }`.

### 3.2. So sánh Toàn vẹn Text (Full Text Comparison)
- So sánh `rawText !== baseline.fullText`.
- Chuỗi gửi trong `state.text` và `result.textPreview` được cắt lát bằng `rawText.slice(0, 500)`.
- `baseline.fullText` luôn lưu trữ toàn bộ chuỗi `rawText` không bị cắt ngắn.
