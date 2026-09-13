---

description: "Danh sách task triển khai shortcut desktop theo profile"
---

# Tasks: Shortcut desktop theo profile

**Đầu vào**: Các artifact thiết kế trong `/specs/005-desktop-shortcuts/`

**Đặc tả**: [spec.md](spec.md)

**Kế hoạch**: [plan.md](plan.md)

**Phạm vi**: Phase 4 chỉ tạo/cập nhật/gỡ shortcut cấp người dùng và launcher bundle; không nối CRUD GUI, xóa session, pin/unpin tự động hay dependency desktop mới của Phase 5.

**Kiểm thử**: Test là bắt buộc vì đặc tả yêu cầu các acceptance scenario, success criteria và quickstart có thể chạy. Mỗi nhóm test phải được viết trước implementation tương ứng và xác nhận FAIL trước khi sửa mã nguồn.

## Phase 1: Setup (Hạ tầng dùng chung)

**Mục đích**: Bổ sung entry point đóng gói mà không thay đổi `npm run build` hiện có.

- [ ] T001 [P] Thêm script `package:linux` vào `package.json`, gọi `node scripts/package-linux.mjs`, giữ nguyên các script `build`, `typecheck`, `test`, `prestart` và `start` hiện có.

---

## Phase 2: Foundational (Tiền đề chặn)

**Mục đích**: Hoàn thiện kiểu kết quả dùng chung trước khi triển khai các user story.

**⚠️ CRITICAL**: Không bắt đầu service hoặc test story trước khi phase này hoàn tất.

- [ ] T002 Bổ sung `ShortcutSyncResult` vào `src/shared/types.ts` đúng union `{ status: 'created' | 'updated' | 'removed' | 'unchanged'; path: string } | { status: 'error'; path: string; message: string }`, không thay đổi `Profile`, `DesktopIntegrationConfig` hoặc hành vi type hiện có.

**Checkpoint**: Kiểu kết quả shortcut biên dịch được và các story có thể dùng chung contract.

---

## Phase 3: User Story 1 - Mở đúng profile từ menu desktop (Ưu tiên: P1) 🎯 MVP

**Mục tiêu**: Từ một bundle đã cài, Desktop Entry mở đúng runner/profile bất kể cwd, PATH hay đường cài có khoảng trắng.

**Kiểm thử độc lập**: Sinh entry cho profile smoke hợp lệ, kiểm tra `Exec` giải mã thành `[launcherPath, '--profile', profileId]`, chạy launcher tuyệt đối từ cwd khác với PATH tối thiểu và xác nhận runner đúng profile; lặp 10 lần không có runner thứ hai.

### Test cho User Story 1

> Viết test trước implementation và chạy để xác nhận FAIL.

- [ ] T003 [P] [US1] Viết test thất bại trong `tests/desktop-service.test.ts` cho XDG `XDG_DATA_HOME` tuyệt đối/rỗng/tương đối, profile ID slug hợp lệ, tên tiếng Việt, filename `zaloview-<id>.desktop`, marker ownership và bộ key Desktop Entry cố định.
- [ ] T004 [P] [US1] Viết test thất bại trong `tests/package-linux.test.ts` cho `npm run package:linux` hoặc `scripts/package-linux.mjs --output "$TMP_DIR"`: bundle có `resources/app/package.json`, `resources/app/dist/main/index.js`, binary launcher executable, locales/runtime cần thiết và không yêu cầu Node/npm sau khi cài.

### Implementation cho User Story 1

- [ ] T005 [US1] Tạo `src/main/desktop-service.ts` với validation trước filesystem và serializer thuần: dùng `validateProfileId`, suy ra applications dir từ `resolveDataDir`, tạo `zaloview-<id>.desktop`, kiểm tra `Name` tối đa 120 ký tự không control character, launcher absolute regular executable, icon managed absolute hoặc `applications-internet`, đồng thời encode Desktop Entry string và từng `Exec` argv riêng không qua shell.
- [ ] T006 [US1] Hoàn thiện `syncProfileShortcut(profile, launcherPath)` trong `src/main/desktop-service.ts`: `createDesktopShortcut=true` sinh nội dung UTF-8 cố định gồm `Version=1.5`, `Type=Application`, `Name`, `Exec`, `Icon`, `Terminal=false`, `Categories=Network;`, `StartupWMClass`, `X-ZaloWebView-ProfileId`; dùng `atomicWriteFile(path, content, 0o644)` và trả `created`, `updated` hoặc `unchanged` theo bytes/ownership.
- [ ] T007 [P] [US1] Tạo `scripts/package-linux.mjs` dùng Node standard library: chạy build, sao chép toàn bộ Electron distribution theo `process.arch` vào `build/zaloview-linux-${process.arch}` hoặc thư mục `--output`, đổi binary `electron` thành `zaloview`, chép app vào `resources/app`, giữ sandbox/locales và thoát khác 0 nếu runtime/app thiếu; không thêm `--no-sandbox` hay dependency mới.
- [ ] T008 [US1] Chạy targeted tests và smoke bundle từ `tests/desktop-service.test.ts`, `tests/package-linux.test.ts`, `specs/005-desktop-shortcuts/contracts/desktop-shortcut.md` và `specs/005-desktop-shortcuts/contracts/installed-launcher.md`; xác nhận `Exec` mở đúng profile từ cwd ngoài repository, đường có khoảng trắng và PATH tối thiểu.

**Checkpoint**: User Story 1 độc lập hoạt động; có bundle launcher và entry mở đúng profile, nhưng chưa cần GUI Manager.

---

## Phase 4: User Story 2 - Đồng bộ vòng đời shortcut an toàn (Ưu tiên: P1)

**Mục tiêu**: Bật, cập nhật, tắt và xóa shortcut lặp an toàn, chỉ tác động file thuộc profile mục tiêu.

**Phụ thuộc**: T005–T008 phải hoàn tất vì story này mở rộng cùng service và Desktop Entry đã sinh ở MVP.

**Kiểm thử độc lập**: Chuỗi bật lần đầu → bật lại → đổi tên/icon → tắt → tắt lại trả `created/unchanged/updated/removed/unchanged`, giữ file của profile khác, file ứng dụng khác và session.

### Test cho User Story 2

> Viết test trước phần lifecycle implementation và chạy để xác nhận FAIL.

- [ ] T009 [US2] Bổ sung test trong `tests/desktop-service.test.ts` cho chuỗi lifecycle, file marker sai, symlink, collision unowned, ID traversal, file profile khác, icon thiếu và quyền entry `0644` trong khi registry fixture vẫn `0600`.

### Implementation cho User Story 2

- [ ] T010 [US2] Hoàn thiện `removeProfileShortcut(profileId)` và nhánh disable trong `src/main/desktop-service.ts`: validate ID trước path, dùng `lstat`, chỉ remove regular file có marker khớp, file không tồn tại trả `unchanged`, symlink/unowned/collision trả `error`, không xóa session/icon gốc/file profile khác.
- [ ] T011 [US2] Chạy `npm test -- tests/desktop-service.test.ts tests/atomic-writer.test.ts tests/profile-storage.test.ts` và kiểm tra bằng `stat`/fixture rằng cập nhật rename giữ file cũ khi lỗi, thao tác tắt hai lần idempotent, writer registry vẫn mặc định `0600` và service không gọi `update-desktop-database`.

**Checkpoint**: User Stories 1 và 2 cùng hoạt động; shortcut phản ánh cấu hình hiện tại và không phá dữ liệu ngoài mục tiêu.

---

## Phase 5: User Story 3 - Kết quả rõ ràng khi đồng bộ thất bại (Ưu tiên: P2)

**Mục tiêu**: Lỗi shortcut không làm mất profile đã lưu, không để lại file dở dang và có thể retry.

**Phụ thuộc**: T006 và T010 phải hoàn tất để test được cả ghi mới, cập nhật và remove.

**Kiểm thử độc lập**: Mô phỏng lỗi write/fsync/rename sau khi profile fixture đã lưu; kết quả giữ profile, trả `status: 'error'` kèm path/message, entry cũ vẫn dùng được và retry chỉ đồng bộ entry.

### Test cho User Story 3

- [ ] T012 [US3] Viết test thất bại trong `tests/desktop-service.test.ts` cho lỗi `atomicWriteFile`, lỗi rename, launcher thiếu/non-executable, icon ngoài vùng managed, kết quả lưu profile tách khỏi `ShortcutSyncResult`, retry không tạo profile trùng và file shortcut cũ không bị thay đổi.

### Implementation cho User Story 3

- [ ] T013 [US3] Hoàn thiện mapping lỗi trong `src/main/desktop-service.ts`: validation reject trước thao tác ghi, I/O/collision/ownership trả `{ status: 'error', path, message }`, không rollback registry, không tạo file tạm còn sót và không phụ thuộc `update-desktop-database`.
- [ ] T014 [US3] Chạy fault-injection và retry suite tại `tests/desktop-service.test.ts`, `tests/atomic-writer.test.ts`, `tests/profile-storage.test.ts`; xác nhận mọi ca lỗi giữ entry/registry trước đó đọc được và lần retry trả trạng thái lifecycle đúng.

**Checkpoint**: Lỗi tích hợp desktop được hiển thị riêng, dữ liệu profile không mất và có đường retry an toàn cho Phase 5.

---

## Phase 6: User Story 4 - Biết rõ mức hỗ trợ môi trường desktop (Ưu tiên: P3)

**Mục tiêu**: Có hướng dẫn cài launcher và bằng chứng thực tế theo KDE/GNOME × X11/Wayland.

**Phụ thuộc**: T007 và T008 phải hoàn tất để nghiệm thu bằng launcher bundle, không dùng launcher dev.

**Kiểm thử độc lập**: Trên từng desktop/backend khả dụng, dùng entry sinh bởi service và bundle đã cài; ghi validator, menu ≤30 giây, mở đúng profile, 10 lần mở không trùng, identity, icon và pin/unpin; môi trường thiếu ghi “Chưa kiểm thử”.

### Test và tài liệu cho User Story 4

- [ ] T015 [P] [US4] Tạo `docs/installation.md` ghi vị trí bundle cấp người dùng ổn định, đường `launcherPath` tuyệt đối, cách cài/cập nhật/gỡ, quyền executable, yêu cầu kiến trúc, giới hạn sandbox và việc không cần Node/npm/devDependencies sau cài.
- [ ] T016 [US4] Chạy nghiệm thu thực theo `specs/005-desktop-shortcuts/quickstart.md` và cập nhật ma trận bằng chứng trong `docs/installation.md`: `desktop-file-validate` khi có; X11 đo `WM_CLASS` bằng `xprop`; Wayland đo `app_id`; menu, launch, PID/socket/window, icon, pin/unpin ghi riêng; không suy `StartupWMClass` sang Wayland.

**Checkpoint**: Có hướng dẫn cài và kết quả/giới hạn thực tế cho từng môi trường đã kiểm tra, không tuyên bố hỗ trợ chéo khi thiếu bằng chứng.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Mục đích**: Kiểm tra toàn repo và chuẩn bị bàn giao Phase 4.

- [ ] T017 Chạy `npm run typecheck`, `npm test`, `npm run build` và targeted suite của `specs/005-desktop-shortcuts/quickstart.md`; sửa chỉ các lỗi thuộc Phase 4 và giữ test hiện có `107/107` không hồi quy.
- [ ] T018 Đối chiếu toàn bộ `specs/005-desktop-shortcuts/spec.md` với `plan.md`, `data-model.md`, `contracts/` và `quickstart.md`; cập nhật `specs/005-desktop-shortcuts/checklists/requirements.md` cùng ghi chú bằng chứng, không thêm scope GUI/Phase 5.
- [ ] T019 Trước commit, chạy `node .gitnexus/run.cjs detect-changes --scope all --repo .` và ghi kết quả đầy đủ (không `partial`/`truncated`) vào `specs/005-desktop-shortcuts/plan.md`; nếu có risk ngoài dự kiến, dừng để rà soát impact thay vì bỏ qua.

---

## Phụ thuộc và thứ tự thực thi

### Phụ thuộc theo phase

- **Setup (Phase 1)**: T001 không phụ thuộc task khác.
- **Foundational (Phase 2)**: T002 phụ thuộc T001 và chặn mọi user story.
- **User Story 1 (Phase 3)**: T003–T004 có thể chạy song song sau T002; T005–T006 phụ thuộc test T003; T007 phụ thuộc T001 và có thể chạy song song với T005–T006; T008 chờ T005–T007.
- **User Story 2 (Phase 4)**: T009 chờ T008; T010 chờ T009; T011 chờ T010.
- **User Story 3 (Phase 5)**: T012 chờ T010/T011; T013 chờ T012; T014 chờ T013.
- **User Story 4 (Phase 6)**: T015 có thể chạy song song từ sau T002; T016 chờ T007, T008 và T015.
- **Polish (Phase 7)**: T017 chờ T008, T011, T014, T016; T018 chờ T017; T019 chạy sau khi mọi thay đổi mã nguồn đã ổn định và trước commit.

### Thứ tự user story

```text
T001 → T002
         ├─ US1: T003/T004 → T005/T006/T007 → T008 (MVP)
         │                         ├─ US2: T009 → T010 → T011
         │                         │                 └─ US3: T012 → T013 → T014
         │                         └─ US4: T015 → T016
         └─ (T015 có thể chạy song song khi không sửa cùng file)
T008 + T011 + T014 + T016 → T017 → T018 → T019
```

### Cơ hội song song

- **US1**: T003 (`tests/desktop-service.test.ts`) và T004 (`tests/package-linux.test.ts`) chạy song song; sau đó T007 (`scripts/package-linux.mjs`) có thể chạy song song với T005–T006 vì khác file.
- **US2**: Không tách song song các task cùng sửa `tests/desktop-service.test.ts`/`src/main/desktop-service.ts`; giữ tuần tự để tránh xung đột và bảo đảm test đỏ trước implementation.
- **US3**: T012 và T013 không song song vì cùng hợp đồng service; T014 chỉ chạy sau fault-injection implementation.
- **US4**: T015 (`docs/installation.md`) có thể chạy song song với US2/US3; T016 cần bundle và service đã hoàn tất.
- **Polish**: T017, T018, T019 phải tuần tự vì lần lượt kiểm thử, đối chiếu artifact và phân tích graph trước commit.

## Ví dụ thực thi song song

```text
Sau T002:
  Worker A: T003 — test serialization/validation trong tests/desktop-service.test.ts
  Worker B: T004 — test bundle trong tests/package-linux.test.ts
  Worker C: T015 — sau khi chọn worker story, soạn docs/installation.md

Sau T003 + T004:
  Worker A: T005/T006 — src/main/desktop-service.ts
  Worker B: T007 — scripts/package-linux.mjs và package.json

Sau T008:
  Worker A: T009/T010/T011 — lifecycle
  Worker B: T015 — tài liệu cài đặt nếu chưa hoàn tất

Sau T011:
  Worker A: T012/T013/T014 — lỗi từng phần và retry
  Worker B: chuẩn bị dữ liệu môi trường cho T016
```

## Chiến lược triển khai

### MVP trước (chỉ User Story 1)

1. Hoàn tất T001–T002.
2. Viết test đỏ T003–T004.
3. Hoàn thiện service và bundle T005–T007.
4. Chạy T008: entry/launcher phải mở đúng profile độc lập.
5. Dừng tại checkpoint để review MVP trước khi thêm lifecycle/error/desktop matrix.

### Bàn giao tăng dần

1. US1 cung cấp launcher portable và shortcut mở đúng profile.
2. US2 thêm lifecycle idempotent, ownership và bảo toàn file ngoài mục tiêu.
3. US3 thêm kết quả lỗi từng phần và retry không mất registry.
4. US4 bổ sung hướng dẫn cài và bằng chứng KDE/GNOME, X11/Wayland.
5. Phase 7 chạy full verification và GitNexus change analysis trước commit.

## Kiểm tra format

- Tổng số task: **19** (Setup 1, Foundational 1, US1 6, US2 3, US3 3, US4 2, Polish 3).
- 19/19 task bắt đầu bằng `- [ ]` và mã tuần tự `T001`–`T019`.
- 19/19 task có đường dẫn file cụ thể; task user story có nhãn `[US1]`–`[US4]`, task setup/foundation/polish không có nhãn story.
- Task `[P]` chỉ dùng cho file khác nhau và không phụ thuộc task chưa hoàn tất.
