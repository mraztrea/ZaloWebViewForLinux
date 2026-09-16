---
description: "Danh sách task triển khai tính năng Nhập/Xuất Profile"
---

# Tasks: Nhập/Xuất danh sách và cấu hình Profile

**Đầu vào**: Tài liệu thiết kế trong `specs/009-profile-import-export/`

**Prerequisites**: plan.md (bắt buộc), spec.md (bắt buộc cho user story), research.md, data-model.md, contracts/

**Tests**: Có — plan.md và quickstart.md yêu cầu kiểm chứng bằng Vitest (SC-005),
nên các task test thuộc phạm vi bắt buộc của tính năng này.

**Tổ chức**: Task nhóm theo user story để mỗi story có thể triển khai và kiểm thử độc lập.

## Format: `[ID] [P?] [Story] Mô tả`

- **[P]**: Có thể chạy song song (file khác nhau, không phụ thuộc task chưa xong)
- **[Story]**: Task thuộc user story nào (US1, US2, US3)
- Mô tả kèm đường dẫn file chính xác

## Path Conventions

Single project tại gốc repo: `src/`, `tests/`.

---

## Phase 1: Setup (Hạ tầng dùng chung)

**Purpose**: Khai báo kiểu dữ liệu và hằng số nền cho mọi story.

- [X] T001 [P] Thêm các kiểu dữ liệu chuyển đổi vào `src/shared/types.ts`: `ExportedIcon { mimeType: string; data: string }`, `ExportedProfile { id; name; url; userAgent?; xpathConfig; desktopConfig; icon? }`, `ExportBundle { schemaVersion: number; exportedAt: string; profiles: ExportedProfile[] }`, `ExportResult = { cancelled: true; reason: 'CANCELLED' | 'EMPTY' } | { cancelled: false; count: number; path: string }`, `ImportReport { cancelled; addedCount; added: { id; name }[]; skipped: { id; reason: 'ID_EXISTS' | 'SESSION_DATA_EXISTS' }[]; invalid: { index: number; reason: string }[]; warnings: { id?: string; reason: 'ICON_IGNORED' | 'SHORTCUT_FAILED' }[] }`, `ParsedProfileEntry { id; name; url; userAgent?; xpathConfig; desktopConfig; iconBase64? }`.
- [X] T002 [P] Tạo `src/main/profile-transfer.ts` với class `ProfileTransferError extends Error`, hằng `PROFILE_EXPORT_SCHEMA_VERSION = 1` và `MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024`; module không import `electron`, không chạm FS.

---

## Phase 2: Foundational (Điều kiện tiên quyết chặn mọi story)

**Purpose**: Hợp đồng IPC/preload và dep hộp thoại mà cả US1 lẫn US2 đều cần.

**⚠️ CRITICAL**: Không story nào bắt đầu được trước khi xong phase này.

- [X] T003 Mở rộng `ManagerServiceDeps` trong `src/main/manager-handlers.ts` với `showSaveDialog?: (defaultName: string) => Promise<string | null>` và `showJsonOpenDialog?: () => Promise<string | null>`; thêm giá trị mặc định trong constructor (`showSaveDialog ?? (async () => null)`, `showJsonOpenDialog ?? (async () => null)`); giữ nguyên `showOpenDialog` cũ cho luồng icon.
- [X] T004 Thêm `exportProfiles: 'zaloview:export-profiles'` và `importProfiles: 'zaloview:import-profiles'` vào `MANAGER_CHANNELS` trong `src/main/manager-handlers.ts`.
- [X] T005 Wire hai dep hộp thoại trong `src/main/index.ts` (`setupManagerHandlers`): `showSaveDialog` dùng `dialog.showSaveDialog({ defaultPath, filters: [{ name: 'JSON', extensions: ['json'] }] })`, `showJsonOpenDialog` dùng `dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })`, trả `null` khi hủy (phụ thuộc T003).
- [X] T006 [P] Thêm `exportProfiles(): Promise<ExportResult>` và `importProfiles(): Promise<ImportReport>` vào `ManagerBridgeApi` và object `api` trong `src/preload/manager-preload.ts`, gọi `ipcRenderer.invoke('zaloview:export-profiles')` / `ipcRenderer.invoke('zaloview:import-profiles')` (import kiểu từ `../shared/types`).

**Checkpoint**: Hợp đồng bridge + dep hộp thoại sẵn sàng — bắt đầu được US1/US2.

---

## Phase 3: User Story 1 - Xuất toàn bộ danh sách profile (Priority: P1) 🎯 MVP

**Goal**: Người dùng bấm "Xuất", chọn nơi lưu và nhận tệp JSON chứa toàn bộ cấu hình profile kèm icon base64.

**Independent Test**: Tạo 2 profile (một có icon), bấm "Xuất", mở tệp JSON: đúng số lượng, đủ trường cấu hình, có `icon.data`, không có `createdAt`/`updatedAt`/`iconPath`/dữ liệu phiên.

### Tests for User Story 1

- [X] T007 [P] [US1] Viết unit test cho `buildExportBundle` trong `tests/profile-transfer.test.ts`: giữ `id/name/url/userAgent/xpathConfig/desktopConfig`; bỏ `createdAt`, `updatedAt`, `iconPath`; profile có icon đọc được → có `icon.data`; `iconReader` trả `null` → bỏ icon mà không lỗi; `exportedAt`/`schemaVersion=1` đúng; mảng rỗng → `profiles: []`. Test phải FAIL trước T008.

### Implementation for User Story 1

- [X] T008 [US1] Cài `buildExportBundle(profiles, iconReader, now?)` trong `src/main/profile-transfer.ts` per `research.md` Q4 và `data-model.md` mục 2–3 (không xuất `createdAt`/`updatedAt`/`iconPath`; `iconReader` trả `Buffer | null`).
- [X] T009 [US1] Cài `ManagerService.exportProfiles()` trong `src/main/manager-handlers.ts`: đọc registry (lỗi → `ManagerError('REGISTRY_CORRUPT')`), registry rỗng → trả `{ cancelled: true, reason: 'EMPTY' }`; gọi `showSaveDialog('zaloview-profiles-YYYYMMDD.json')`, hủy → `{ cancelled: true, reason: 'CANCELLED' }`; `buildExportBundle` với `iconReader` đọc file trong `this.deps.iconDir` (kiểm tra đường dẫn nằm trong `iconDir`, lỗi → `null`); ghi bằng `atomicWriteFile`, lỗi → `ManagerError('EXPORT_WRITE_FAILED', ...)`; trả `{ cancelled: false, count, path }`.
- [X] T010 [US1] Đăng ký handler `MANAGER_CHANNELS.exportProfiles` trong `registerManagerHandlers` (`src/main/manager-handlers.ts`): gọi `guard(event)` rồi `service.exportProfiles()`, không nhận tham số payload.
- [X] T011 [US1] Thêm nút "Xuất" (`id="btn-export-profiles"`) vào `header-actions` trong `src/renderer/manager/index.html`; trong `src/renderer/manager/app.ts` thêm `onExportProfiles()` gọi `bridge().exportProfiles()`, disable nút khi đang chờ, `setStatus` báo "Đã xuất N profile tới <path>.", xử lý `reason === 'EMPTY'` ("Chưa có profile nào để xuất.") và lỗi; thêm style nút phụ trong `src/renderer/manager/styles.css` nếu cần.
- [X] T012 [US1] Viết test service cho `exportProfiles` trong `tests/manager.test.ts` (theo pattern temp XDG + dialog giả): hủy dialog không ghi tệp; registry rỗng trả `reason: 'EMPTY'`; thành công ghi tệp và trả `count`/`path` đúng.

**Checkpoint**: US1 chạy và kiểm thử độc lập được (KB-1, KB-2, KB-3 trong quickstart.md).

---

## Phase 4: User Story 2 - Nhập danh sách profile từ tệp (Priority: P1)

**Goal**: Người dùng bấm "Nhập", chọn tệp JSON và Manager tạo lại profile hợp lệ, bỏ qua trùng/lỗi.

**Independent Test**: Nhập tệp hợp lệ vào registry trống → profile xuất hiện đủ cấu hình; nhập lại tệp đó → báo bỏ qua theo ID; tệp sai `schemaVersion` → không đổi registry.

### Tests for User Story 2

- [X] T013 [P] [US2] Viết unit test cho `parseImportBundle` trong `tests/profile-transfer.test.ts`: happy path map đúng `ParsedProfileEntry`; JSON hỏng / `schemaVersion: 2` / `profiles` không phải mảng → ném `ProfileTransferError`; mục thiếu `name`, `url: 'ftp://x'`, `xpathConfig.mode` lạ, `pollIntervalMs` ngoài 1000–60000, `desktopConfig.flashTaskbar` không boolean → vào `invalid` kèm `index`; trường lạ bị bỏ qua; `icon` thiếu `mimeType`/`data` → bỏ icon im lặng; mảng rỗng → `entries: []`. Test phải FAIL trước T014.

### Implementation for User Story 2

- [X] T014 [US2] Cài `parseImportBundle(raw)` trong `src/main/profile-transfer.ts`: parse JSON (lỗi → `ProfileTransferError`), kiểm tra `schemaVersion === PROFILE_EXPORT_SCHEMA_VERSION` và `profiles` là mảng (sai → ném); mỗi mục dùng `validateProfile` để chuẩn hóa rồi map sang `ParsedProfileEntry`; mục lỗi gom vào `invalid` với `index`; chỉ nhận `icon` khi `mimeType` và `data` là chuỗi phi rỗng.
- [X] T015 [US2] Cài `ManagerService.importProfiles()` trong `src/main/manager-handlers.ts`: `showJsonOpenDialog()` hủy → `{ cancelled: true, addedCount: 0, added: [], skipped: [], invalid: [], warnings: [] }`; `fs.statSync` chặn file > `MAX_IMPORT_FILE_BYTES` → `ManagerError('IMPORT_FILE_TOO_LARGE')`; đọc UTF-8 + `parseImportBundle`, lỗi cấu trúc → `ManagerError('IMPORT_INVALID_FILE')`; với mỗi entry: ID đã có → `skipped: 'ID_EXISTS'`; có icon → `Buffer.from(iconBase64, 'base64')`, chặn > `ICON_MAX_BYTES`, `storeIconBuffer` trả `fallback` → `warnings: 'ICON_IGNORED'` và `iconPath = undefined`; gọi `profileManager.createProfile` (bắt `ProfileDataExistsError` → `skipped: 'SESSION_DATA_EXISTS'`; `ProfileValidationError`/`ProfileDuplicateIdError` → `invalid`); thành công → `addedCount++`, gọi `syncShortcut` trong try/catch (lỗi → `warnings: 'SHORTCUT_FAILED'`).
- [X] T016 [US2] Đăng ký handler `MANAGER_CHANNELS.importProfiles` trong `registerManagerHandlers` (`src/main/manager-handlers.ts`): `guard(event)` rồi `service.importProfiles()`, không nhận tham số payload.
- [X] T017 [US2] Thêm nút "Nhập" (`id="btn-import-profiles"`) vào `header-actions` trong `src/renderer/manager/index.html`; trong `src/renderer/manager/app.ts` thêm `onImportProfiles()` gọi `bridge().importProfiles()`, disable nút khi chờ, im lặng khi hủy, `setStatus` tóm tắt "Đã thêm N profile, bỏ qua M, không hợp lệ K." và gọi `void reloadProfiles()` khi `addedCount > 0`.
- [X] T018 [US2] Viết test service cho `importProfiles` trong `tests/manager.test.ts`: hủy dialog không đổi registry; file hợp lệ → thêm đủ, `addedCount` đúng; ID trùng → `skipped: 'ID_EXISTS'`; JSON hỏng/`schemaVersion` sai → ném và registry giữ nguyên; file quá lớn → `IMPORT_FILE_TOO_LARGE`.

**Checkpoint**: US1 + US2 chạy và kiểm thử độc lập (KB-4, KB-5, KB-7, KB-9, KB-10).

---

## Phase 5: User Story 3 - Báo cáo kết quả nhập minh bạch (Priority: P2)

**Goal**: Hiển thị đầy đủ danh sách bỏ qua/không hợp lệ và cảnh báo icon/shortcut để người dùng xử lý thủ công.

**Independent Test**: Nhập tệp trộn hợp lệ + trùng + lỗi + icon hỏng → báo cáo liệt kê đúng từng mục kèm lý do.

### Implementation for User Story 3

- [X] T019 [US3] Mở rộng `onImportProfiles()` trong `src/renderer/manager/app.ts` để ngoài tóm tắt còn dựng danh sách chi tiết `skipped` (ID + lý do), `invalid` (vị trí + lý do) và `warnings` (ICON_IGNORED/SHORTCUT_FAILED, kèm ID nếu có) bằng `textContent` (không dùng `innerHTML`); thêm style danh sách báo cáo trong `src/renderer/manager/styles.css`.
- [X] T020 [US3] Viết test shape báo cáo trong `tests/manager.test.ts`: profile có icon nhúng hỏng → `warnings` chứa `ICON_IGNORED` và profile vẫn được thêm không icon; `syncShortcut` ném lỗi → `warnings` chứa `SHORTCUT_FAILED` và profile vẫn tồn tại; `invalid` chứa đúng `index` của mục lỗi.

**Checkpoint**: Cả 3 story hoạt động độc lập; báo cáo đầy đủ (KB-6, KB-8, KB-11).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Kiểm chứng đầu cuối và ghi nhận kết quả.

- [X] T021 [P] Ghi kết quả kiểm chứng tính năng vào `docs/verification.md` (mục mới cho 009: lệnh đã chạy, kết quả, các KB đã thực hiện).
- [X] T022 Chạy `npm run typecheck` và `npm test`; sửa mọi lỗi kiểu/test phát sinh cho tới khi sạch.
- [ ] T023 Chạy các kịch bản thủ công KB-1…KB-11 trong `specs/009-profile-import-export/quickstart.md` và ghi lại kết quả quan sát.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Không phụ thuộc — bắt đầu ngay.
- **Foundational (Phase 2)**: Phụ thuộc Phase 1 — CHẶN mọi story.
- **User Stories (Phase 3+)**: Phụ thuộc Phase 2.
  - US1 và US2 độc lập, có thể làm song song nếu đủ người; nhưng cả hai cùng sửa `src/main/manager-handlers.ts` và `src/preload/manager-preload.ts` nên thực tế nên làm tuần tự P1 → P1.
  - US3 phụ thuộc US2 (dùng `ImportReport` do `importProfiles` sinh ra).
- **Polish (Phase 6)**: Phụ thuộc mọi story mong muốn hoàn tất.

### Trong từng story

- Test viết trước và phải FAIL trước khi implement (TDD).
- Model/module thuần trước, service sau, IPC sau, UI sau.
- US1: T007 → T008 → T009 → T010 → T011 → T012.
- US2: T013 → T014 → T015 → T016 → T017 → T018.
- US3: T019 → T020.

### Ràng buộc file (tránh xung đột song song)

- `src/main/manager-handlers.ts` bị chạm bởi T003, T004, T009, T010, T015, T016 → không chạy song song các task này.
- `src/main/profile-transfer.ts` bị chạm bởi T002, T008, T014 → tuần tự.
- `src/renderer/manager/app.ts` bị chạm bởi T011, T017, T019 → tuần tự.
- `tests/manager.test.ts` bị chạm bởi T012, T018, T020 → tuần tự.
- `tests/profile-transfer.test.ts` bị chạm bởi T007, T013 → tuần tự.

---

## Parallel Example

```bash
# Phase 1 có thể chạy song song:
Task: "T001 Thêm kiểu dữ liệu chuyển đổi vào src/shared/types.ts"
Task: "T002 Tạo src/main/profile-transfer.ts với hằng số và ProfileTransferError"

# Phase 2: T006 chạy song song được với T003–T005:
Task: "T006 Thêm exportProfiles/importProfiles vào src/preload/manager-preload.ts"
```

---

## Implementation Strategy

### MVP First (chỉ US1)

1. Hoàn tất Phase 1 + Phase 2.
2. Hoàn tất Phase 3 (US1).
3. **DỪNG và KIỂM CHỨNG**: chạy T007/T012 và KB-1…KB-3.
4. Demo: người dùng đã sao lưu được toàn bộ cấu hình profile.

### Incremental Delivery

1. Setup + Foundational → nền sẵn sàng.
2. US1 → kiểm chứng độc lập → giá trị sao lưu (MVP).
3. US2 → kiểm chứng độc lập → giá trị khôi phục.
4. US3 → báo cáo chi tiết.
5. Polish → typecheck/test sạch + ghi nhận kiểm chứng.

---

## Notes

- [P] = file khác nhau, không phụ thuộc task chưa xong.
- Mọi thao tác đọc/ghi tệp và hộp thoại nằm ở main; renderer chỉ gọi bridge (FR-016).
- Không thêm dependency npm mới (FR-019).
- Tên profile báo cáo hiển thị bằng `textContent`, không `innerHTML`.
- Test viết trước, xác nhận FAIL rồi mới implement.
- Commit theo từng task hoặc nhóm logic (khi người dùng yêu cầu).

## Format validation

- [x] Mọi task có checkbox `- [ ]`, Task ID tuần tự (T001…T023).
- [x] Task song song có `[P]`; task thuộc story có nhãn `[US1]`/`[US2]`/`[US3]`.
- [x] Task phase Setup/Foundational/Polish không gắn nhãn story.
- [x] Mọi task nêu đường dẫn file cụ thể.
