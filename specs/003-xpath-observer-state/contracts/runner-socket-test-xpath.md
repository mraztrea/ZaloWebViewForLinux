# Interface Contract: Mở rộng Socket Điều khiển Runner cho `test-xpath`

**Tệp**: `specs/003-xpath-observer-state/contracts/runner-socket-test-xpath.md`
**Phạm vi**: Main Process — `src/main/runner-control.ts`

---

## 1. Giao thức Lệnh `test-xpath`

Kênh Unix Domain Socket cục bộ của runner được mở rộng để tiếp nhận lệnh `test-xpath` từ Manager Dashboard hoặc CLI client.

### 1.1. Cấu trúc Yêu cầu (Request Schema)

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "action": "test-xpath",
  "params": {
    "selector": "//span[contains(@class, 'tab-unread')]",
    "mode": "badge_count"
  }
}
```

**Ràng buộc tham số (`params`)**:
- `selector`: Chuỗi bắt buộc, độ dài từ 1 đến 1000 ký tự.
- `mode`: Chuỗi bắt buộc, thuộc tập `["existence", "badge_count", "text_content"]`.

---

### 1.2. Phản hồi Thành công (Success Response Schema)

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "success": true,
  "data": {
    "status": "match",
    "selector": "//span[contains(@class, 'tab-unread')]",
    "mode": "badge_count",
    "hasElement": true,
    "count": 5,
    "textPreview": "5",
    "executionTimeMs": 14
  }
}
```

Trường hợp không tìm thấy phần tử (`no_match`):
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "success": true,
  "data": {
    "status": "no_match",
    "selector": "//div[@id='missing-node']",
    "mode": "existence",
    "hasElement": false,
    "count": 0,
    "textPreview": "",
    "executionTimeMs": 8
  }
}
```

---

### 1.3. Phản hồi Lỗi Nghiệp vụ hoặc Cú pháp

Trường hợp biểu thức XPath sai cú pháp hoặc trả về scalar (`invalid_selector`):
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "success": false,
  "error": "INVALID_SELECTOR: Biểu thức XPath sai cú pháp hoặc không trỏ tới Node hợp lệ."
}
```

Trường hợp dữ liệu không thể chuyển đổi thành số nguyên ở chế độ `badge_count` (`invalid_data`):
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "success": false,
  "error": "INVALID_DATA: Nội dung 'abc' không phải là số nguyên đếm thông báo hợp lệ."
}
```

Trường hợp trang đang điều hướng hoặc cửa sổ bị đóng trước khi có kết quả:
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "success": false,
  "error": "PAGE_NAVIGATED: Trang web đã điều hướng hoặc tải lại trong khi đang kiểm tra XPath."
}
```

Trường hợp hết thời gian chờ (Timeout sau 5000 ms):
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "success": false,
  "error": "TIMEOUT: Quá thời gian chờ phản hồi kết quả XPath từ trang web (5000 ms)."
}
```

---

## 2. Kiểm soát Luồng và Giới hạn (Concurrency & Rate Limiting)

1. **Giới hạn 1 yêu cầu chờ trên mỗi runner**:
   - Mỗi instance runner chỉ cho phép tối đa 1 yêu cầu `test-xpath` ở trạng thái chờ tại một thời điểm.
   - Nếu nhận yêu cầu mới khi yêu cầu trước chưa hoàn tất, runner lập tức từ chối với lỗi `CONCURRENT_TEST_NOT_ALLOWED`.
2. **Hủy yêu cầu an toàn**:
   - Khi cửa sổ runner đóng (`close` / `destroyed`), mọi request chờ lập tức được phản hồi với lỗi `RUNNER_CLOSED`.
