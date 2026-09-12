# Tasks: XPath Observer và Quản lý Trạng thái (Phase 2)

**Branch**: `003-xpath-observer-state` | **Feature Directory**: `specs/003-xpath-observer-state`
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

---

## Phase 1: Setup (Shared Types & Test Harness)

**Purpose**: Thiết lập các kiểu dữ liệu dùng chung và môi trường kiểm thử cho module XPath.

- [ ] T001 Cập nhật các định nghĩa kiểu `XPathObservationMode`, `XPathObservationState`, `XPathBaselineRecord`, `XPathEvaluationStatus`, `XPathEvaluationResult` trong file `src/shared/types.ts`
- [ ] T002 [P] Mở rộng các hợp đồng lệnh socket `RunnerControlRequest` và `RunnerControlResponse` để hỗ trợ action `'test-xpath'` và tham số trong file `src/shared/types.ts`

---

## Phase 2: Foundational (Core Evaluator & Parsing Engine)

**Purpose**: Xây dựng nền tảng đánh giá XPath DOM và giải mã số liệu cốt lõi trước khi áp dụng cho các User Stories.

**⚠️ CRITICAL**: Phải hoàn thành Phase này trước khi triển khai các User Stories.

- [ ] T003 Hiện thực hóa hàm đánh giá XPath cơ bản `evaluateXPath` sử dụng `document.evaluate` với `XPathResult.FIRST_ORDERED_NODE_TYPE`, xử lý ngoại lệ `DOMException` và phát hiện kết quả vô hướng (scalar) thành lỗi `'invalid_selector'`, xử lý selector rỗng trong file `src/preload/xpath-evaluator.ts`
- [ ] T004 [P] Hiện thực hóa hàm `parseBadgeCount` với regex verbatim `/^(\d+)(\+)?$/`, kiểm tra giới hạn an toàn `count <= Number.MAX_SAFE_INTEGER`, trả về `isValid: false` (lỗi `'invalid_data'`) cho `'abc'`, `'-1'`, `'1.5'` trong file `src/preload/xpath-evaluator.ts`

**Checkpoint**: Nền tảng đánh giá và phân tích dữ liệu sẵn sàng cho các user stories.

---

## Phase 3: User Story 1 - Quan sát DOM tự động theo ba chế độ thông báo (Priority: P1) 🎯 MVP

**Goal**: Đánh giá và trích xuất dữ liệu DOM theo 3 chế độ `existence`, `badge_count`, `text_content`.

**Independent Test**: Chạy unit test kiểm tra 3 chế độ trên tài liệu HTML giả lập, xác nhận kết quả trích xuất đúng đặc tả.

### Tests for User Story 1

- [ ] T005 [P] [US1] Viết unit tests kiểm thử 3 chế độ trích xuất `existence`, `badge_count`, `text_content` và các trường hợp lỗi `invalid_selector`, `invalid_data`, `no_match` trong file `tests/xpath-evaluator.test.ts`

### Implementation for User Story 1

- [ ] T006 [US1] Hoàn thiện trích xuất theo 3 chế độ trong hàm `evaluateXPath`: chế độ `existence` (xác định `hasElement: boolean`), `badge_count` (gán 0 khi `no_match`, trích xuất số và báo lỗi khi text không hợp lệ), `text_content` (cắt khoảng trắng hai đầu bằng `trim()`, chuỗi rỗng không tạo cảnh báo) trong file `src/preload/xpath-evaluator.ts`

**Checkpoint**: User Story 1 hoạt động độc lập và đạt 100% test.

---

## Phase 4: User Story 2 - So sánh mẫu trạng thái và cập nhật baseline không gây cảnh báo giả (Priority: P1)

**Goal**: So sánh mẫu quan sát với baseline, phát hiện chính xác chuỗi tăng `5 → 3 → 4` và không reset baseline khi focus.

**Independent Test**: Chạy unit test kiểm tra hàm so sánh baseline với các chuỗi tăng giảm số lượng, thay đổi text vượt 500 ký tự và biến mất phần tử.

### Tests for User Story 2

- [ ] T007 [P] [US2] Viết unit tests kiểm thử hàm `compareWithBaseline` với chuỗi `5 → 3 → 4`, disappearance/reappearance, và so sánh chuỗi text đầy đủ trước khi cắt preview trong file `tests/xpath-evaluator.test.ts`

### Implementation for User Story 2

- [ ] T008 [US2] Hiện thực hóa hàm `compareWithBaseline`: so sánh theo bảng chân trị từng mode, tính toán cờ `changedForAlert`, cập nhật baseline khi count giảm hoặc node mất, so sánh toàn vẹn text trước khi cắt preview 500 ký tự cho IPC trong file `src/preload/xpath-evaluator.ts`

**Checkpoint**: User Story 1 và 2 kết hợp hoàn hảo, quản lý baseline chính xác không cảnh báo giả.

---

## Phase 5: User Story 3 - Quan sát phản ứng nhanh kết hợp quét định kỳ và phục hồi an toàn (Priority: P2)

**Goal**: Theo dõi DOM bằng MutationObserver với debounce 300 ms, quét định kỳ dự phòng 3000 ms, quét lại khi resume, và giao tiếp IPC với Main Process.

**Independent Test**: Kiểm tra việc kích hoạt observer trên trang web, nhận thông điệp `xpath:state`/`xpath:error` qua IPC, xác minh debounce 300 ms và dọn dẹp timer khi reload.

### Tests for User Story 3

- [ ] T009 [P] [US3] Viết tests kiểm thử cơ chế debounce 300 ms, hủy timer khi đổi cấu hình, và xử lý sự kiện visibility change trong file `tests/xpath-evaluator.test.ts`

### Implementation for User Story 3

- [ ] T010 [US3] Cài đặt `MutationObserver` theo dõi `{ childList: true, subtree: true, characterData: true, attributes: true }` trên `document.documentElement` kết hợp debounce 300 ms và polling định kỳ `pollIntervalMs` (1000..60000 ms) trong file `src/preload/webview-preload.ts`
- [ ] T011 [US3] Bổ sung lắng nghe sự kiện `visibilitychange` (quét lại khi `visible`), dọn dẹp observer và timer khi nhận `xpath:init` mới hoặc `pagehide`/`unload`, và gửi `xpath:state`, `xpath:error` qua IPC trong file `src/preload/webview-preload.ts`
- [ ] T012 [US3] Hiện thực hóa bộ lắng nghe IPC tại Main process cho `xpath:state` và `xpath:error`, xác thực `event.senderFrame === webContents.mainFrame` và origin hợp lệ, tự động gán `profileId`, và deduplicate lỗi trong file `src/main/index.ts` và `src/main/window-service.ts`

**Checkpoint**: Cơ chế quan sát DOM tự động trên runner hoạt động thông suốt từ Preload tới Main Process.

---

## Phase 6: User Story 4 - Thử nghiệm bộ chọn XPath trực tiếp trên phiên đăng nhập thực tế (Priority: P2)

**Goal**: Mở rộng socket điều khiển runner hỗ trợ lệnh `test-xpath`, định tuyến tới document hiện tại của runner, hiển thị highlight overlay tạm thời và phản hồi kết quả an toàn.

**Independent Test**: Gửi gói tin `test-xpath` qua Unix domain socket tới runner đang chạy, xác nhận nhận được kết quả match/error trong vòng 5 giây mà baseline không bị thay đổi.

### Tests for User Story 4

- [ ] T013 [P] [US4] Viết integration tests cho hành động `test-xpath` qua socket điều khiển runner, kiểm tra timeout 5000 ms, và xử lý điều hướng/đóng cửa sổ trong file `tests/runner-control-xpath.test.ts`

### Implementation for User Story 4

- [ ] T014 [US4] Hiện thực hóa hàm `highlightElement` (hiển thị overlay tạm thời 1500 ms với class riêng để MutationObserver bỏ qua) và xử lý IPC channel `xpath:test` phản hồi qua `xpath:test-result` mà không thay đổi baseline trong file `src/preload/xpath-evaluator.ts` và `src/preload/webview-preload.ts`
- [ ] T015 [US4] Mở rộng lớp `RunnerControlServer` tiếp nhận action `'test-xpath'`, validate tham số (`selector`, `mode`), áp dụng giới hạn 1 pending test request và timeout 5000 ms trong file `src/main/runner-control.ts`
- [ ] T016 [US4] Nối luồng xử lý `test-xpath` từ socket server tại Main process tới cửa sổ `mainWindow.webContents` đang hoạt động và chuyển tiếp kết quả trả về socket client trong file `src/main/index.ts`

**Checkpoint**: Tính năng thử nghiệm XPath thủ công qua socket hoạt động hoàn hảo và độc lập.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Đảm bảo chất lượng mã nguồn, kiểm tra biên dịch đa đích và xác minh toàn bộ các kịch bản nghiệm thu.

- [ ] T017 [P] Cập nhật cấu hình build esbuild trong file `scripts/build.mjs` nếu cần thiết để đảm bảo `src/preload/xpath-evaluator.ts` được đóng gói chuẩn vào `dist/preload/webview-preload.js`
- [ ] T018 Chạy kiểm tra kiểu TypeScript không lỗi (`npm run typecheck`) và chạy toàn bộ bộ kiểm thử (`npm test`)
- [ ] T019 Thực thi kịch bản kiểm thử nghiệm thu theo tài liệu hướng dẫn trong file `specs/003-xpath-observer-state/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Không có phụ thuộc, có thể bắt đầu ngay lập tức.
- **Phase 2 (Foundational)**: Phụ thuộc vào Phase 1. KHÓA toàn bộ các User Stories.
- **Phase 3 (User Story 1 - P1)**: Phụ thuộc vào Phase 2.
- **Phase 4 (User Story 2 - P1)**: Phụ thuộc vào Phase 2 và Phase 3 (kế thừa `evaluateXPath`).
- **Phase 5 (User Story 3 - P2)**: Phụ thuộc vào Phase 3 và Phase 4 (kết nối observer và baseline vào preload runtime).
- **Phase 6 (User Story 4 - P2)**: Phụ thuộc vào Phase 2 và Phase 5 (mở rộng socket và IPC test).
- **Phase 7 (Polish)**: Phụ thuộc vào toàn bộ các User Stories.

### Parallel Opportunities

- T001 và T002 có thể làm song song.
- T003 và T004 có thể làm song song trong Phase 2.
- T005 có thể viết song song hoặc trước T006.
- T007 có thể viết song song hoặc trước T008.
- T009 có thể viết song song hoặc trước T010.
- T013 có thể viết song song với T014, T015.

---

## Implementation Strategy

### MVP Scope (User Story 1 & 2)
1. Hoàn thành Phase 1 (Setup) và Phase 2 (Foundational).
2. Hoàn thành User Story 1 & User Story 2 (Core evaluation & baseline comparator).
3. Chạy `tests/xpath-evaluator.test.ts` để chứng minh thuật toán trích xuất và baseline `5 → 3 → 4` đạt 100%.

### Incremental Delivery
1. Đưa `xpath-evaluator` vào preload và tích hợp observer + debouncing + IPC (User Story 3).
2. Bổ sung socket command `test-xpath` và highlight overlay (User Story 4).
3. Chạy toàn bộ test suite và build hoàn chỉnh (Phase 7).
