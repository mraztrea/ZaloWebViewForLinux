# Interface Contract: Giao tiếp IPC Giám sát XPath (XPath IPC Contract)

**Tệp**: `specs/003-xpath-observer-state/contracts/xpath-ipc.md`
**Phạm vi**: Giữa Main Process (`src/main/`) và Webview Preload Script (`src/preload/webview-preload.ts`)

---

## 1. Nguyên tắc An toàn và Xác thực (Security Policy)

1. **Giới hạn Khung tài liệu (Main Frame Only)**:
   - Mọi thông điệp từ Preload gửi lên Main qua `ipcRenderer.send` chỉ được xử lý nếu:
     `event.senderFrame === mainWindow.webContents.mainFrame`.
   - Các sự kiện phát ra từ `iframe` hoặc cửa sổ con (popup) bị Main từ chối và ghi log cảnh báo an ninh.
2. **Xác thực Nguồn gốc (Origin Verification)**:
   - URL của `event.senderFrame` phải khớp với origin cấu hình của profile (`new URL(profile.url).origin === new URL(senderUrl).origin`).
3. **Định danh Profile (Profile Identity Binding)**:
   - Main tự động gán `profileId` dựa trên thực thể cửa sổ của runner đang quản lý webContents đó. Tuyệt đối không tin tưởng bất kỳ trường ID nào do trang web gửi lên.

---

## 2. Danh mục Kênh IPC (IPC Channels)

### 2.1. Main → Preload: `xpath:init`
- **Mô tả**: Main truyền cấu hình giám sát XPath cho Preload script khi cửa sổ tải xong trang (`did-finish-load`) hoặc khi cấu hình của profile được cập nhật.
- **Payload**:
  ```typescript
  interface XPathInitPayload {
    config: {
      selector: string;
      mode: 'existence' | 'badge_count' | 'text_content';
      pollIntervalMs: number;
    };
  }
  ```
- **Hành vi phía Preload**:
  - Nếu `config.selector.trim() === ''`: ngắt kết nối observer, xóa toàn bộ timer debounce và interval, chuyển sang trạng thái dừng.
  - Nếu `config.selector` hợp lệ: khởi tạo `MutationObserver` và timer định kỳ, thiết lập baseline ban đầu từ rỗng, thực hiện một lượt đánh giá khởi tạo ngay lập tức và gửi mẫu đầu tiên qua `xpath:state`.

---

### 2.2. Preload → Main: `xpath:state`
- **Mô tả**: Preload gửi mẫu trạng thái DOM khi có thay đổi trạng thái hoặc khi gửi mẫu khởi tạo ban đầu.
- **Payload**:
  ```typescript
  interface XPathStatePayload {
    mode: 'existence' | 'badge_count' | 'text_content';
    hasElement: boolean;
    count: number;
    text: string; // Tối đa 500 ký tự
    changedForAlert: boolean;
    timestamp: number;
  }
  ```
- **Hành vi phía Main**:
  - Xác thực sender frame và origin.
  - Cập nhật bộ nhớ đệm trạng thái của profile (`RunnerStatusData.xpathState`).
  - Ghi nhận trạng thái để chuẩn bị cho máy trạng thái attention ở Phase 3.

---

### 2.3. Preload → Main: `xpath:error`
- **Mô tả**: Preload thông báo khi bộ chọn XPath sai cú pháp (`invalid_selector`) hoặc dữ liệu huy hiệu không thể parse thành số (`invalid_data`).
- **Payload**:
  ```typescript
  interface XPathErrorPayload {
    type: 'invalid_selector' | 'invalid_data' | 'eval_error';
    message: string;
    selector: string;
    timestamp: number;
  }
  ```
- **Hành vi phía Main**:
  - Thực hiện lọc trùng lặp (deduplication): Chỉ ghi nhận cảnh báo một lần nếu cùng một lỗi lặp lại liên tiếp.
  - Giữ nguyên baseline hợp lệ gần nhất, không tạo cảnh báo tin nhắn mới.

---

### 2.4. Main → Preload: `xpath:test` (Thử nghiệm thủ công)
- **Mô tả**: Main chuyển tiếp yêu cầu thử nghiệm bộ chọn XPath từ socket client tới preload của runner đang mở.
- **Payload**:
  ```typescript
  interface XPathTestPayload {
    requestId: string;
    selector: string;
    mode: 'existence' | 'badge_count' | 'text_content';
  }
  ```
- **Hành vi phía Preload**:
  - Đánh giá selector trên document hiện tại một cách độc lập.
  - Không thay đổi baseline của observer chính, không phát `xpath:state`.
  - Hiển thị lớp phủ highlight nếu tìm thấy phần tử trực quan, lớp phủ tự hủy sau 1500 ms và không kích hoạt cảnh báo DOM lặp lại.
  - Trả kết quả ngay qua kênh `xpath:test-result`.

---

### 2.5. Preload → Main: `xpath:test-result`
- **Mô tả**: Preload phản hồi kết quả thử nghiệm thủ công về Main process.
- **Payload**:
  ```typescript
  interface XPathTestResultPayload {
    requestId: string;
    success: boolean;
    result?: {
      status: 'match' | 'no_match' | 'invalid_selector' | 'invalid_data' | 'error';
      selector: string;
      mode: 'existence' | 'badge_count' | 'text_content';
      hasElement: boolean;
      count: number;
      textPreview: string;
      error?: string;
      executionTimeMs: number;
    };
    error?: string;
  }
  ```
- **Hành vi phía Main**:
  - Khớp `requestId` với yêu cầu socket đang chờ.
  - Chuyển tiếp kết quả về cho socket client và xóa timer timeout 5000 ms.
