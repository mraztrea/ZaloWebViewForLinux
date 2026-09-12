# Research & Technical Decisions: XPath Observer và Quản lý Trạng thái (Phase 2)

**Branch**: `003-xpath-observer-state` | **Date**: 2026-09-12 | **Spec**: [spec.md](./spec.md)

---

## 1. Cơ chế Đánh giá DOM bằng XPath (`XPathEvaluator`)

### Quyết định kỹ thuật
Sử dụng API chuẩn W3C DOM Level 3 XPath (`document.evaluate`) trong môi trường renderer/preload của Electron với cờ `XPathResult.FIRST_ORDERED_NODE_TYPE` để lấy phần tử node đầu tiên khớp trong tài liệu.

### Chi tiết giải pháp
- **Phân biệt kiểu kết quả**:
  - `document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)`:
    - Nếu cú pháp XPath không hợp lệ: ném ngoại lệ DOMException/SyntaxError → phân loại là `invalid_selector`.
    - Nếu biểu thức trả về kiểu vô hướng (ví dụ `count(//div)` hoặc `boolean(//div)`): `resultType` sẽ là `NUMBER_TYPE` hoặc `BOOLEAN_TYPE` chứ không phải `FIRST_ORDERED_NODE_TYPE` → phân loại là `invalid_selector`.
    - Nếu biểu thức hợp lệ nhưng không có phần tử nào trong DOM khớp: `singleNodeValue === null` → phân loại là `no_match`.
    - Nếu tìm thấy node: `singleNodeValue !== null` → kiểm tra kiểu node (`nodeType === Node.ELEMENT_NODE` hoặc `Node.TEXT_NODE`) và trích xuất dữ liệu → phân loại là `match`.
- **Phân tách selector rỗng**:
  - Nếu `selector.trim() === ''`: lập tức vô hiệu hóa observer, không gọi `document.evaluate`, không hẹn giờ.

### Các lựa chọn thay thế đã xem xét
- **CSS Selectors (`querySelector`)**: Mặc dù đơn giản và nhanh hơn, CSS selector không hỗ trợ lọc theo nội dung văn bản (`contains()`), không hỗ trợ điều hướng ngược lên node cha (`..` / `ancestor::`), vốn rất cần thiết để bắt các huy hiệu tin nhắn động trên giao diện web phức tạp như Zalo Web.
- **Thư viện bên thứ ba (như `xpath` hay `xmldom`)**: Không cần thiết vì Chromium nhúng sẵn trong Electron đã hỗ trợ đầy đủ `document.evaluate` với hiệu năng C++ nguyên bản tối đa.

---

## 2. Quy tắc Phân tích Dữ liệu và Ba Chế độ Giám sát (`XPathObservationMode`)

### Quyết định kỹ thuật
Tách bạch 3 hàm trích xuất và kiểm tra theo 3 mode với quy tắc nghiêm ngặt:

1. **`existence`**:
   - `hasElement = (node !== null)`.
   - `changedForAlert`: Chỉ `true` khi chuyển trạng thái từ `false → true` (lần đầu xuất hiện hoặc xuất hiện lại sau khi đã mất).
   - Mọi thay đổi về text bên trong node không làm kích hoạt cảnh báo (`changedForAlert = false`).

2. **`badge_count`**:
   - Khi không tìm thấy node (`node === null`): `count = 0`, `hasElement = false`.
   - Khi tìm thấy node: Trích xuất `rawText = node.textContent?.trim() || ''`.
   - Quy tắc parse số nguyên:
     - Biểu thức regex kiểm tra: `/^(\d+)(\+)?$/` (cho phép chuỗi chữ số nguyên không âm kèm hậu tố `+` tùy chọn).
     - Ví dụ: `'3'` → 3, `'99+'` → 99, `'0'` → 0.
     - Kiểm tra giới hạn số nguyên: `count <= Number.MAX_SAFE_INTEGER`.
     - Nếu chuỗi text không khớp regex (ví dụ `'abc'`, `'-1'`, `'1.5'`, `'tin mới'`) hoặc text rỗng: Trả về trạng thái lỗi dữ liệu `invalid_data`. Tuyệt đối không đoán thành 1.
   - `changedForAlert`: `true` khi và chỉ khi `hasElement === true` và `count > previousBaseline.count`. Nếu `count <= previousBaseline.count`, `changedForAlert = false`.

3. **`text_content`**:
   - Khi không tìm thấy node: `text = ''`, `hasElement = false`.
   - Khi tìm thấy node: `text = node.textContent?.trim() || ''`.
   - `changedForAlert`: `true` khi `hasElement === true`, `text !== ''`, và `text !== previousBaseline.text`.
   - Nếu `text === ''` (chuỗi rỗng): không bao giờ kích hoạt cảnh báo mới.

### Giới hạn truyền tải & So sánh toàn vẹn
- **Giới hạn Preview IPC**: Thuộc tính `text` gửi qua IPC giới hạn tối đa 500 ký tự để tối ưu bộ nhớ.
- **So sánh trước khi cắt ngắn**: Thuật toán so sánh `text !== previousBaseline.text` được thực thi trên chuỗi gốc đầy đủ trước khi cắt lát `substring(0, 500)` để đảm bảo thay đổi sau ký tự thứ 500 vẫn được nhận diện chính xác.

---

## 3. Chiến lược Quan sát DOM: Kết hợp MutationObserver và Fallback Polling

### Quyết định kỹ thuật
Triển khai mô hình lai (Hybrid Observation) trong script preload:
- **MutationObserver thời gian thực**:
  - Gắn vào `document.documentElement`.
  - Cấu hình: `{ childList: true, subtree: true, characterData: true, attributes: true }`.
  - Bắt cả trường hợp class/attribute của node thay đổi (ví dụ chuyển từ class `hidden` sang `active`).
- **Cơ chế Debounce 300 ms**:
  - Khi có đột biến DOM, nếu timer debounce đang chạy thì hủy timer cũ và đặt lại hẹn giờ 300 ms.
  - Ngăn ngừa hiện tượng giật lag khi website thực hiện render hàng loạt node hoặc hiệu ứng chuyển động.
- **Quét định kỳ dự phòng (Fallback Polling)**:
  - Sử dụng `setInterval` với chu kỳ `pollIntervalMs` (1000..60000 ms, mặc định 3000 ms).
  - Hoãn lượt quét định kỳ nếu vừa có một lượt quét do debounce thực thi trong vòng 300 ms trước đó.
- **Phục hồi sau khi ngủ / hiển thị (Resume / Visibility Trigger)**:
  - Đăng ký sự kiện `document.addEventListener('visibilitychange')`.
  - Khi `document.visibilityState === 'visible'`: Ngay lập tức thực hiện quét lại DOM để bù đắp các chu kỳ timer bị trình duyệt đóng băng (throttle) khi chạy ở nền.
- **Dọn dẹp triệt để (Lifecycle Cleanup)**:
  - Khi nhận `xpath:init` mới hoặc khi sự kiện `pagehide`/`unload` phát sinh: Ngắt kết nối `observer.disconnect()`, xóa `clearTimeout` của debounce, xóa `clearInterval` của poll interval.

---

## 4. Quản lý Baseline và Tách biệt Trạng thái Chú ý (Attention)

### Quyết định kỹ thuật
- **Preload giữ baseline DOM để tính `changedForAlert`**:
  - Preload duy trì `previousBaseline` lưu trữ mẫu hợp lệ gần nhất.
  - Baseline được cập nhật sau mỗi lần quan sát hợp lệ, bao gồm cả khi `count` giảm hoặc node biến mất (`hasElement: false`).
  - Ví dụ chuỗi biến động:
    - Ban đầu: baseline = 0.
    - Nhận count 5: baseline = 5, `changedForAlert = true`.
    - Người dùng đọc tin trên web, count giảm xuống 3: baseline = 3, `changedForAlert = false`.
    - Có tin mới, count tăng lên 4: so sánh 4 > 3 → baseline = 4, `changedForAlert = true`.
- **Cửa sổ nhận tiêu điểm (Window Focus) KHÔNG reset baseline**:
  - Focus cửa sổ là sự kiện quản lý trạng thái chú ý (attention/notification) ở Main Process (Phase 3).
  - Preload không reset baseline về 0 hay rỗng khi focus, để tránh việc khi cửa sổ blur lại thì mẫu cũ bị ngộ nhận là tin mới.
- **Trang web tải lại (Page Reload/Navigation)**:
  - Document mới được tạo kèm preload instance mới. Baseline bắt đầu từ rỗng, mẫu đầu tiên có dữ liệu được so với trạng thái rỗng và gửi mẫu khởi tạo ban đầu (`xpath:state`) tới Main Process.

---

## 5. Xác thực Bảo mật IPC giữa Preload và Main Process

### Quyết định kỹ thuật
- **Kênh IPC chuyên biệt**:
  - Main → Preload: `xpath:init` (gửi `XPathConfig`), `xpath:test` (gửi yêu cầu thử nghiệm thủ công).
  - Preload → Main: `xpath:state` (mẫu trạng thái DOM định kỳ/thay đổi), `xpath:error` (báo lỗi selector/dữ liệu), `xpath:test-result` (kết quả thử nghiệm thủ công).
- **Kiểm soát bảo mật phía Main**:
  - Xác thực người gửi: `event.senderFrame === webContents.mainFrame` (chỉ chấp nhận từ frame chính, từ chối mọi iframe).
  - Xác thực origin: URL của `senderFrame` phải khớp với origin được đăng ký của profile.
  - Xác thực payload: Kiểm tra dữ liệu đúng cấu trúc `XPathObservationState` hoặc `XPathEvaluationResult`.
  - Main tự gắn `profileId` từ ngữ cảnh runner, không tin tưởng ID gửi từ preload.
- **Bộ lọc trùng lặp lỗi (Error Deduplication)**:
  - Main duy trì bộ nhớ đệm lỗi gần nhất theo profile: Nếu một lỗi selector/data lặp lại liên tiếp với cùng thông điệp, chỉ ghi log 1 lần duy nhất để tránh nghẽn luồng log.

---

## 6. Cơ chế Thử nghiệm XPath Trực tiếp qua Kênh Điều khiển Runner (`test-xpath`)

### Quyết định kỹ thuật
- **Định tuyến lệnh**:
  1. Client (Manager Dashboard hoặc CLI test tool) gửi gói tin JSON qua Unix domain socket của runner:
     `{"requestId": "uuid", "action": "test-xpath", "params": {"selector": "...", "mode": "..."}}`.
  2. `RunnerControlServer` tại Main process xác thực schema của lệnh `test-xpath`.
  3. Main chuyển tiếp yêu cầu tới `mainWindow.webContents.send('xpath:test', { requestId, selector, mode })`.
  4. Preload thực thi việc đánh giá trên tài liệu DOM hiện tại:
     - Tạo `XPathEvaluator` độc lập, không ghi đè `previousBaseline` của observer chính.
     - Không phát ra sự kiện `xpath:state`, không kích hoạt cảnh báo.
     - Nếu node hợp lệ và hiển thị: thêm lớp phủ highlight (đường viền/nền mờ nhẹ) và tự động gỡ bỏ sau 1500 ms.
     - Lớp phủ highlight được đánh dấu class riêng (`__zaloview_highlight_overlay__`) để MutationObserver của bộ giám sát chính bỏ qua, không kích hoạt cảnh báo giả.
  5. Preload phản hồi kết quả `xpath:test-result` về Main process qua IPC.
  6. Main đóng gói dữ liệu và phản hồi qua socket về cho client.
- **Xử lý Timeout & Navigation**:
  - Thời gian chờ tối đa cho request thử nghiệm là 5000 ms.
  - Nếu trong lúc đang chờ, webContents phát sinh sự kiện `did-start-navigation` hoặc `did-navigate` hoặc `close`: Ngay lập tức hủy bỏ request và trả về lỗi phản hồi thích hợp (`PAGE_NAVIGATED` hoặc `RUNNER_CLOSED`).
  - Mỗi runner chỉ cho phép 1 request `test-xpath` ở trạng thái pending tại một thời điểm để chống spam.
