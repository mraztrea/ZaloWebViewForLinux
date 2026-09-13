---

description: "Danh sách task triển khai Manager Phase 5 và nghiệm thu đầu cuối"

---

# Tasks: Manager Phase 5 và nghiệm thu đầu cuối

**Đầu vào**: Các artifact thiết kế trong `/specs/007-phase5-manager/`

**Đặc tả**: [spec.md](spec.md)

**Kế hoạch**: [plan.md](plan.md)

**Phạm vi**: Hoàn thiện Manager (bridge hẹp, handlers thật, dashboard, icon, xóa an toàn) và nghiệm thu đầu cuối có bằng chứng; tái sử dụng `ProfileManager`, socket runner, attention và service shortcut phase 4, không xây engine XPath/notification mới.

**Kiểm thử**: Test là bắt buộc vì đặc tả yêu cầu các acceptance scenario, success criteria và quickstart có thể chạy. Mỗi nhóm test phải được viết trước implementation tương ứng và xác nhận FAIL trước khi sửa mã nguồn.

## Phase 1: Setup (Hạ tầng dùng chung)

**Mục đích**: Tạo khung preload/handlers/build cho Manager mà chưa gắn logic story nào.

- [ ] T001 Tạo `src/preload/manager-preload.ts` expose đúng 10 API (`getProfiles`, `saveProfile`, `deleteProfile`, `launchProfile`, `toggleShortcut`, `getRunnerStatus`, `clearAttention`, `testXPath`, `chooseIcon`, `fetchIcon`, `deleteProfileSession`) qua `window.zaloview`, không expose generic invoke, `ipcRenderer` hay event.
- [ ] T002 Nối `scripts/build.mjs` bundle `src/preload/manager-preload.ts` ra `dist/preload/manager-preload.js` và giữ copy asset `src/renderer/manager/index.html`, `styles.css`.
- [ ] T003 Chuyển `createManagerWindow` trong `src/main/index.ts` sang dùng preload Manager riêng thay vì `webview-preload.js`, giữ nguyên `sandbox: true`, `nodeIntegration: false`, `contextIsolation: true`.

---

## Phase 2: Foundational (Tiền đề chặn)

**Mục đích**: Khung validation và đăng ký handler mà mọi user story đều phụ thuộc.

**⚠️ CRITICAL**: Không bắt đầu test hoặc implementation story trước khi phase này hoàn tất.

- [ ] T004 Tạo khung `src/main/manager-handlers.ts` với validate sender/main frame/URL local và payload: từ chối website, iframe, payload null/sai kiểu/trường nguy hiểm trước khi chạm storage/socket (P5-01).
- [ ] T005 [P] Mở rộng `tests/build.test.ts` kiểm tra bundle `manager-preload.js`, asset Manager và Manager sandbox không lỗi `require`/`exports`, website không thấy bridge Manager.

**Checkpoint**: Khung handler từ chối đúng mọi nguồn không tin cậy; build ra đủ bundle mới.

---

## Phase 3: User Story 1 - Quản lý profile tập trung (Ưu tiên: P1) 🎯 MVP

**Mục tiêu**: Manager hiển thị, tìm kiếm, thêm và sửa profile đúng dữ liệu thật.

**Kiểm thử độc lập**: Chuẩn bị nhiều profile, mở Manager, tìm kiếm, thêm một profile rồi sửa toàn bộ trường; dữ liệu hiển thị và đọc lại phải khớp, kể cả các lựa chọn đang tắt.

### Tests cho User Story 1

> **GHI NHỚ: Viết các test này TRƯỚC, xác nhận FAIL trước khi implementation.**

- [ ] T006 [P] [US1] Test validation handler trong `tests/manager.test.ts`: tên và boolean hợp lệ được chấp nhận; sender website/iframe/URL sai, null/array/thừa trường nguy hiểm bị từ chối và không gọi storage/socket.
- [ ] T007 [P] [US1] Test lưu profile trong `tests/manager.test.ts`: sửa với `false` giữ `false`; ID/"thời điểm tạo" và "tác nhân trình duyệt" bất biến; lỗi lưu giữ form; lưu xong mới đóng.

### Implementation cho User Story 1

- [ ] T008 [US1] Triển khai `getProfiles` trong `src/main/manager-handlers.ts`: trả `Profile[]` đã validate, tệp hỏng trả lỗi rõ ràng, không giả danh sách rỗng.
- [ ] T009 [US1] Triển khai `saveProfile` trong `src/main/manager-handlers.ts` theo whitelist chỉ "trường cho phép sửa": tạo mới sinh "định danh riêng" + timestamps ở main, cập nhật giữ ID + "thời điểm tạo" + userAgent; trả `{ profile, shortcut, restartRequired }` (bổ sung `ManagerSaveResult` vào `src/shared/types.ts` sau đối chiếu schema).
- [ ] T010 [US1] Hoàn thiện danh sách trong `src/renderer/manager/app.ts` và `index.html`: cards icon/tên/địa chỉ/trạng thái, tìm kiếm theo tên/địa chỉ, phân biệt loading/empty/error; dừng poll khi cửa sổ ẩn.
- [ ] T011 [US1] Hoàn thiện biểu mẫu thêm/sửa trong `src/renderer/manager/app.ts`: form thêm dùng defaults mô hình hiện có, form sửa nạp đủ mode/interval/icon/"năm checkbox"; lỗi lưu giữ dữ liệu; render mọi dữ liệu profile bằng `textContent`, tên chứa HTML hiện literal.
- [ ] T012 [US1] Chạy `npm run typecheck`, `npm run build` và `npm test -- tests/manager.test.ts tests/build.test.ts`; smoke Manager sandbox trên Electron thật.

**Checkpoint**: User Story 1 vận hành độc lập: CRUD + tìm kiếm đúng dữ liệu thật, giữ form khi lỗi.

---

## Phase 4: User Story 2 - Mở runner và theo dõi trạng thái độc lập (Ưu tiên: P1)

**Mục tiêu**: Mở runner từng profile từ Manager, trạng thái chạy/dừng/chưa xác định đáng tin cậy, xóa cảnh báo đúng profile, Manager đóng/mở không ảnh hưởng runner.

**Kiểm thử độc lập**: Mở hai runner, tạo cảnh báo riêng, xóa cảnh báo một profile, đóng/mở lại Manager và mở lặp cùng profile; mỗi runner giữ trạng thái độc lập, không phiên trùng.

### Tests cho User Story 2

- [ ] T013 [P] [US2] Test `getRunnerStatus` trong `tests/manager.test.ts`: lỗi socket trả `unknown` chứ không phải stopped; kèm `RunnerStatusData` và revision khi liên lạc được.
- [ ] T014 [P] [US2] Test launch/restore trong `tests/runner-control.test.ts`: spawn lỗi hiện rõ; mở lặp restore không tạo runner thứ hai; đóng Manager không đóng runner.

### Implementation cho User Story 2

- [ ] T015 [US2] Triển khai `launchProfile`, `getRunnerStatus`, `clearAttention` trong `src/main/manager-handlers.ts`: launch bằng argument array qua đường cài phase 4, trả "đã gửi yêu cầu mở"; `clear-attention` tới đúng socket, không reset baseline.
- [ ] T016 [US2] Nối vòng đời trong `src/main/index.ts`: Manager đóng runner vẫn chạy, mở lặp restore đúng profile (single-instance lock hiện có), mở Manager từ tray là instance độc lập.
- [ ] T017 [US2] Hiển thị trạng thái trong `src/renderer/manager/app.ts`: refresh khi Manager hiển thị, dừng timer khi ẩn/đóng; trạng thái "đã yêu cầu mở" khác "runner sẵn sàng"; nút mở/xóa cảnh báo theo từng profile.
- [ ] T018 [US2] Chạy `npm test -- tests/manager.test.ts tests/runner-control.test.ts` cùng `npm run typecheck`.

**Checkpoint**: User Story 1 + 2 cùng vận hành: quản lý profile và điều khiển runner độc lập.

---

## Phase 5: User Story 3 - Hoàn thiện cấu hình bằng công cụ hỗ trợ (Ưu tiên: P2)

**Mục tiêu**: Chọn/tải icon an toàn, đồng bộ shortcut báo lỗi từng phần, thử XPath đúng runner với 6 loại kết quả phân biệt.

**Kiểm thử độc lập**: Chọn icon local/tải từ website, lưu khi sync shortcut lỗi, thử XPath khớp/không khớp/đầu vào sai; profile đã lưu nguyên vẹn, mỗi lỗi có hướng thử lại.

### Tests cho User Story 3

- [ ] T019 [P] [US3] Tạo `tests/icon-fetcher.test.ts`: HTTP(S), redirect đổi protocol, redirect thứ 6, timeout 5000 ms, stream vượt 2 MiB dù header nhỏ/thiếu, ảnh vượt 1024×1024, ảnh hỏng, file mất → fallback PNG kèm lý do, không gửi cookie phiên.
- [ ] T020 [P] [US3] Test shortcut từng phần trong `tests/manager.test.ts`: registry lưu nhưng entry lỗi vẫn báo đúng và cho retry không tạo trùng; config runner cũ hiển thị "cần mở lại" từ revision.
- [ ] T021 [P] [US3] Test thử XPath trong `tests/runner-control-xpath.test.ts`: match/no-match/selector sai/dữ liệu sai/loading/timeout, kết quả document cũ bị bỏ, không đổi baseline/config, không tạo attention.

### Implementation cho User Story 3

- [ ] T022 [US3] Tạo `src/main/icon-fetcher.ts` dùng fetch/AbortController hiện có: validate từng redirect "tối đa 5", "timeout tổng 5000 ms", đếm byte thực "tối đa 2 MiB", decode + kiểm tra "tối đa 1024×1024", chuẩn hóa PNG bằng công cụ Electron, lưu vào vùng icon app; SVG mạng không render inline.
- [ ] T023 [US3] Triển khai `chooseIcon`/`fetchIcon` trong `src/main/manager-handlers.ts`: dialog file qua cùng kiểm tra ảnh, hủy dialog không phải lỗi; resolve favicon/apple-touch-icon URL tương đối.
- [ ] T024 [US3] Triển khai `toggleShortcut` trong `src/main/manager-handlers.ts`: lưu checkbox rồi gọi service phase 4, trả kết quả save/shortcut riêng; `restartRequired` so revision snapshot runner với profile đã lưu, không lấy được revision → chưa xác định.
- [ ] T025 [US3] Triển khai `testXPath` trong `src/main/manager-handlers.ts`: chuyển `test-xpath` qua đúng runner/document theo profileId; profile chưa lưu/chưa mở trả hướng dẫn; mã kết quả dùng enum hiện có (`no_match`, `invalid_selector`, `invalid_data`), chỉ Việt hóa nhãn UI.
- [ ] T026 [US3] Nối UI trong `src/renderer/manager/app.ts`: thử XPath bằng ID đã lưu + selector/mode đang nhập; partial shortcut failure báo phần đã lưu; config thay đổi hiện trạng thái cần mở lại.
- [ ] T027 [US3] Chạy `npm test -- tests/icon-fetcher.test.ts tests/manager.test.ts tests/runner-control-xpath.test.ts tests/xpath-evaluator.test.ts` cùng `npm run typecheck`.

**Checkpoint**: Mọi user story P1 + công cụ hỗ trợ P2 vận hành độc lập, lỗi từng phần báo riêng.

---

## Phase 6: User Story 4 - Xóa profile và dữ liệu phiên có chủ đích (Ưu tiên: P2)

**Mục tiêu**: Xóa profile chỉ sau xác nhận dừng thật, giữ session mặc định; xóa phiên là hành động riêng có xác nhận.

**Kiểm thử độc lập**: Xóa profile đang chạy, mô phỏng dừng thất bại rồi dừng thành công; xác nhận session còn lại; thử xóa phiên với cả hủy và xác nhận.

### Tests cho User Story 4

- [ ] T028 [P] [US4] Test xóa trong `tests/manager.test.ts`: status unknown, shutdown ACK nhưng PID còn sống, timeout, entry gỡ lỗi, registry ghi lỗi → giữ registry khi chưa dừng hoặc gỡ lỗi; tạo lại cùng tên không nhận session cũ.
- [ ] T029 [P] [US4] Test xóa phiên trong `tests/manager.test.ts`: hủy xác nhận không đổi dữ liệu; path traversal bị chặn; dữ liệu profile khác nguyên vẹn.

### Implementation cho User Story 4

- [ ] T030 [US4] Triển khai `deleteProfile` trong `src/main/manager-handlers.ts`: xác nhận dừng thật (không coi ACK là đã dừng) → gỡ shortcut → xóa registry, giữ session; lỗi từng bước báo đúng bước và cho retry.
- [ ] T031 [US4] Triển khai `deleteProfileSession` trong `src/main/manager-handlers.ts`: xác nhận native do main quản lý (không nhận boolean renderer gửi), validate mục tiêu + runner đã dừng + đường dẫn thuộc app.
- [ ] T032 [US4] Nối UI xóa trong `src/renderer/manager/app.ts`: xác nhận xóa nêu rõ runner phải dừng; hành động xóa phiên riêng hiện đúng ID/phạm vi dữ liệu.
- [ ] T033 [US4] Chạy `npm test -- tests/manager.test.ts tests/profile-manager.test.ts tests/desktop-service.test.ts` cùng `npm run typecheck`.

**Checkpoint**: Mọi thao tác xóa an toàn, session chỉ mất khi người dùng chủ động xác nhận riêng.

---

## Phase 7: User Story 5 - Nghiệm thu đầu cuối có bằng chứng (Ưu tiên: P2)

**Mục tiêu**: Chuỗi GUI đầy đủ + fault test + báo cáo riêng bản dev/phân phối theo ma trận desktop thực.

**Kiểm thử độc lập**: Thực hiện toàn bộ chuỗi trên một desktop có sẵn, ghi từng bước đạt/chưa đạt kèm bằng chứng; môi trường không truy cập được giữ "Chưa kiểm thử".

### Tests cho User Story 5

- [ ] T034 [P] [US5] Tạo `tests/integration.test.ts`: chuỗi thêm A/B → mở riêng → thử XPath → cảnh báo → focus clear → shortcut → mở lặp → sửa → xóa giữ session; A focus không xóa badge B; Manager restart không đóng runner; fault JSON hỏng, lỗi ghi/mạng, runner crash, socket cũ.

### Implementation cho User Story 5

- [ ] T035 [US5] Chạy từ checkout sạch `npm ci`, `npm run typecheck`, `npm run build`, `npm test`; smoke bản phân phối theo đường cài (preload/assets/runtime, sandbox thật) theo `quickstart.md` Kịch bản 6.
- [ ] T036 [US5] Thực hiện Kịch bản 1–5 trong `specs/007-phase5-manager/quickstart.md` trên desktop có sẵn (upload/download, clipboard, mic/cam grant-deny, session sau restart, tháo màn hình); mọi lỗi phát hiện chỉ đánh dấu đã sửa sau ca hồi quy + thử lại.
- [ ] T037 [US5] Ghi `docs/verification.md` với mã P4/P5, commit, phiên bản, lệnh/thao tác, kết quả và bằng chứng; điền ma trận desktop trong spec, giữ "Chưa kiểm thử" khi không truy cập display; không thay kết quả desktop bằng số lượng unit test.

**Checkpoint**: Chuỗi đầu cuối có báo cáo thực; gate P5-01…P5-12 và R03–R06 đối chiếu xong.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Mục đích**: Hoàn thiện ngang các story trước khi đóng phase.

- [ ] T038 [P] Rà soát an toàn UI trong `src/renderer/manager/` cho P5-10: label/focus/Escape/focus-return, keyboard toàn thao tác chính, CSP asset local, theme hệ thống + chọn tay trong `styles.css`.
- [ ] T039 Cập nhật `docs/installation.md` từ phase 4 theo kết quả triển khai thực tế (đường cài, chạy, fallback CLI khi tray không hiện).
- [ ] T040 Chạy toàn bộ `npm run typecheck`, `npm run build`, `npm test` và đối chiếu P5-01…P5-12 trước khi đóng phase.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Không phụ thuộc — bắt đầu ngay.
- **Foundational (Phase 2)**: Phụ thuộc Setup — CHẶN mọi user story.
- **User Stories (Phase 3–7)**: Phụ thuộc Foundational; tiến hành song song nếu đủ người hoặc tuần tự P1 → P2.
- **Polish (Phase 8)**: Phụ thuộc mọi story mong muốn đã hoàn tất.

### User Story Dependencies

- **US1 (P1)**: Sau Foundational, không phụ thuộc story khác — là MVP.
- **US2 (P1)**: Sau Foundational, dùng handler/bridge của US1 nhưng kiểm thử độc lập.
- **US3 (P2)**: Sau Foundational, độc lập với US2 (icon/shortcut/XPath không cần runner lifecycle của US2 ngoài socket hiện có).
- **US4 (P2)**: Sau Foundational; nên sau US1 (cần saveProfile) nhưng kiểm thử độc lập.
- **US5 (P2)**: Phụ thuộc US1–US4 (chuỗi đầu cuối bao phủ mọi story).

### Trong mỗi User Story

- Test viết trước, FAIL trước khi implementation.
- Handler/service trước UI.
- Logic lõi trước tích hợp (`index.ts`/`build.mjs`/renderer).
- Chạy lệnh kiểm chứng của story trước khi sang story tiếp theo.

### Parallel Opportunities

- T001–T003 khác file, song song được nhưng T002/T003 cần file từ T001 tồn tại khi build thử.
- T005 song song với T004 (khác file).
- Các test [P] trong mỗi story (T006+T007, T013+T014, T019+T020+T021, T028+T029) chạy song song.
- US2/US3/US4 có thể giao cho người khác nhau sau Foundational; US5 cuối cùng.

---

## Parallel Example: User Story 3

```bash
# Chạy song song các test của US3 (khác file, không phụ thuộc nhau):
Task: "Tạo tests/icon-fetcher.test.ts: HTTP(S), redirect, timeout, size, fallback"
Task: "Test shortcut từng phần trong tests/manager.test.ts"
Task: "Test thử XPath trong tests/runner-control-xpath.test.ts"

# Chạy song song implementation khác file sau khi test FAIL:
Task: "Tạo src/main/icon-fetcher.ts"
Task: "Triển khai toggleShortcut trong src/main/manager-handlers.ts"
```

## Parallel Example: User Story 1 (MVP)

```bash
Task: "Test validation handler trong tests/manager.test.ts"
Task: "Test lưu profile trong tests/manager.test.ts"
# Sau khi cả hai FAIL:
Task: "Triển khai getProfiles trong src/main/manager-handlers.ts"
Task: "Hoàn thiện danh sách trong src/renderer/manager/app.ts"
```

---

## Implementation Strategy

### MVP First (chỉ User Story 1)

1. Hoàn tất Phase 1 (Setup) + Phase 2 (Foundational).
2. Hoàn tất Phase 3 (US1).
3. **DỪNG và VALIDATE**: CRUD + tìm kiếm đúng dữ liệu thật theo Independent Test của US1.
4. Demo được ngay dưới dạng Manager quản lý profile cơ bản.

### Incremental Delivery

1. Setup + Foundational → khung bridge/validation sẵn sàng.
2. + US1 → Manager quản lý profile (MVP).
3. + US2 → điều khiển runner độc lập.
4. + US3 → icon/shortcut/XPath.
5. + US4 → xóa an toàn.
6. + US5 → nghiệm thu có bằng chứng, đóng phase.

### Parallel Team Strategy

Với nhiều người: cùng hoàn tất Setup + Foundational, sau đó mỗi người một story (US2/US3/US4 song song), cuối cùng cùng làm US5 + Polish.

---

## Notes

- Task [P] = khác file, không phụ thuộc task chưa xong.
- Nhãn [US1]…[US5] ánh xạ task tới user story trong spec.md để truy vết.
- Mỗi story hoàn thiện và kiểm thử độc lập được; dừng ở bất kỳ checkpoint nào để validate.
- Tránh: task mơ hồ, hai task cùng sửa một file song song, phụ thuộc chéo phá tính độc lập story.
- Commit sau mỗi task hoặc nhóm logic; kiểm chứng bằng lệnh trong task trước khi commit.
