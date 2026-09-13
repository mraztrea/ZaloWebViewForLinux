# Kế hoạch triển khai: Manager Phase 5 và nghiệm thu đầu cuối

**Nhánh**: `007-phase5-manager` | **Ngày**: 2026-09-13 | **Đặc tả**: [spec.md](spec.md)

**Đầu vào**: Đặc tả tính năng từ `specs/007-phase5-manager/spec.md`, nguồn nghiệp vụ `docs/phases/phase-5-manager/spec.md` (P5-01…P5-12) và `docs/phases/phase-5-manager/plan.md` (P5-T1…P5-T5).

> Ghi chú: đây là tài liệu kế hoạch và thiết kế. Mọi lệnh kiểm chứng (`npm run typecheck`, `npm test`, `npm run build`) được chạy ở bước thực thi (`speckit-tasks` / `speckit-implement`), không phải ở bước này.

## Summary

Hoàn thiện Manager thành bảng điều khiển GUI đầy đủ: bridge hẹp từng API cho renderer sandbox gọi handler thật ở main (CRUD profile, mở runner, trạng thái, xóa cảnh báo, thử XPath, shortcut, icon), dashboard hiển thị cards/tìm kiếm/biểu mẫu, và chuỗi nghiệm thu đầu cuối có báo cáo theo môi trường desktop thực. Hướng tiếp cận: tái sử dụng `ProfileManager`, socket `RunnerControlServer`, `AttentionController` và service shortcut phase 4; chỉ thêm lớp mỏng mới (preload riêng, handlers, icon-fetcher, renderer) và nối vào `index.ts` + `build.mjs`.

## Technical Context

**Language/Version**: TypeScript strict, Node.js `>= 22.0.0`, Electron `>= 44.3.0`

**Primary Dependencies**: Electron (main / preload / renderer sandbox), esbuild (`scripts/build.mjs`), Vitest

**Storage**: Tệp JSON cục bộ qua `ProfileManager` + ghi nguyên tử (`atomic-writer.ts`); đường dẫn XDG (`xdg-paths.ts`); thư mục session riêng từng profile; thư mục icon trong vùng dữ liệu app

**Testing**: Vitest (unit/integration cho handler, validation, icon, socket) + smoke thủ công trên Electron thật cho preload/sandbox/launcher + báo cáo `docs/verification.md`

**Target Platform**: Linux desktop (KDE Plasma / GNOME; X11 / Wayland)

**Project Type**: desktop-app (Electron: main process + sandbox renderer + preload bridge)

**Performance Goals**: Danh sách Manager hiển thị ngay với trạng thái loading/empty/error riêng; thăm dò trạng thái runner chỉ khi Manager hiển thị, dừng timer khi ẩn/đóng; tải icon có trần: timeout tổng 5000 ms, tối đa 5 redirect, tối đa 2 MiB và 1024×1024 (đếm byte thực tế khi đọc stream)

**Constraints**: Renderer sandbox (`sandbox: true`, `nodeIntegration: false`, `contextIsolation: true`); preload chỉ expose từng API qua `window.zaloview`, kiểm tra sender/main frame/URL local và payload, không expose generic invoke hay `ipcRenderer`; CSP chỉ dùng asset local; tên profile hiển thị nguyên văn (không chèn vào `innerHTML`); xác nhận xóa phiên bằng dialog native do main quản lý

**Scale/Scope**: Ứng dụng local một người dùng, hàng chục profile; 5 nhóm đầu việc (P5-T1…P5-T5) bao phủ P5-01…P5-12

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Không có tệp `.specify/memory/constitution.md` trong dự án nên các gate dưới đây được suy ra từ `AGENTS.md`, `docs/phases/README.md` và `docs/design_specification.md`:

- [x] **Tái sử dụng trước khi xây mới**: Dùng lại `ProfileManager`, socket runner, attention và service shortcut phase 4; không xây engine XPath/notification mới. — ĐẠT (plan chỉ thêm lớp mỏng bridge/handlers/UI).
- [x] **Tối giản (YAGNI)**: Không abstraction/wrapper trừ khi cần; dùng API có sẵn của Node/Electron (fetch, AbortController, dialog, decode PNG của Electron). — ĐẠT.
- [x] **An toàn IPC**: Bridge hẹp từng API + validation sender/frame/URL/payload cho mọi handler mới. — ĐẠT (yêu cầu bắt buộc của P5-T1).
- [x] **Kiểm chứng**: Mọi nhóm việc đều khai báo lệnh `typecheck`/`test`/`build` tương ứng; nghiệm thu desktop chỉ ghi kết quả quan sát thực. — ĐẠT.
- [x] **Tài liệu tiếng Việt**: Mọi tài liệu specs/plan/research/data-model/quickstart viết bằng tiếng Việt. — ĐẠT.

*Re-check sau Phase 1 (xem cuối plan): thiết kế giữ nguyên các gate trên, không phát sinh abstraction mới.*

## Project Structure

### Documentation (this feature)

```text
specs/007-phase5-manager/
├── plan.md              # Tệp này (kế hoạch + Technical Context + thiết kế)
├── research.md          # Phase 0: quyết định kỹ thuật và cơ sở
├── data-model.md        # Phase 1: mô hình dữ liệu
├── quickstart.md        # Phase 1: hướng dẫn kiểm chứng đầu cuối
├── contracts/           # Phase 1: hợp đồng bridge Manager ↔ main
│   └── manager-api.contract.md
└── tasks.md             # Phase 2 (speckit-tasks tạo, KHÔNG thuộc bước này)
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── index.ts              # Nối: preload riêng cho Manager, đăng ký manager-handlers
│   ├── manager-handlers.ts   # MỚI: handler CRUD/launch/status/clear/test-xpath/icon/session
│   ├── profile-manager.ts    # Dùng lại: CRUD registry, giữ ID/createdAt, chặn ID còn session
│   ├── runner-control.ts     # Dùng lại: client socket status/shutdown/clear/test-xpath
│   ├── desktop-service.ts    # Dùng lại: syncProfileShortcut/removeProfileShortcut
│   └── icon-fetcher.ts       # MỚI: tải + validate + chuẩn hóa icon về vùng app
├── preload/
│   ├── webview-preload.ts    # Hiện có (runner) — KHÔNG trộn bridge Manager vào
│   └── manager-preload.ts    # MỚI: expose từng API Manager qua window.zaloview
├── renderer/manager/
│   ├── app.ts                # Hoàn thiện: cards/search/form/test-xpath/keyboard/theme
│   ├── index.html            # Hoàn thiện: cấu trúc dashboard, dialog, form
│   └── styles.css            # Hoàn thiện: loading/empty/error, dark/light/system
└── shared/
    └── types.ts              # Dùng lại Profile/XPathEvaluationResult/RunnerStatusData/
                             # ShortcutSyncResult; chỉ thêm hợp đồng Manager sau đối chiếu

tests/
├── manager.test.ts               # MỚI: validation + handler + partial failure
├── icon-fetcher.test.ts          # MỚI: redirect/size/timeout/fallback
├── integration.test.ts           # MỚI: chuỗi đầu cuối CRUD→launch→xpath→alert→xóa
├── profile-manager.test.ts       # Mở rộng: whitelist update, retry, ID còn session
├── runner-control.test.ts        # Dùng lại/mở rộng: status/shutdown/clear
├── runner-control-xpath.test.ts  # Dùng lại/mở rộng: test-xpath lifecycle
└── build.test.ts                 # Mở rộng: bundle preload Manager, asset, sandbox

scripts/build.mjs  # Nối: bundle manager-preload + copy asset Manager
```

**Structure Decision**: Dự án đơn (single Electron app), giữ nguyên bố cục `src/` + `tests/` hiện có; chỉ thêm 3 tệp nguồn mới (manager-preload, manager-handlers, icon-fetcher) và 3 tệp test mới, còn lại là nối/mở rộng. Không tách backend/frontend vì main ↔ renderer giao tiếp qua IPC bridge, không qua HTTP.

## Thiết kế theo nhóm việc

### P5-T1 — Bridge và hợp đồng status (P5-01, P5-02, P5-04)

- Định nghĩa payload/result đúng bảng API trong `docs/phases/phase-5-manager/spec.md`; dùng type hiện có (`Profile`, `XPathEvaluationResult`, `RunnerStatusData`, `ShortcutSyncResult`), không tạo bộ type profile song song.
- `manager-preload.ts` expose từng API; `createManagerWindow` dùng preload riêng; `build.mjs` thêm bundle tương ứng.
- Handler validate sender (không phải website/iframe), URL local, payload null/sai kiểu/trường nguy hiểm → từ chối trước khi chạm storage/socket.
- `getRunnerStatus` trả running/stopped/unknown + `RunnerStatusData` khi liên lạc được; `restartRequired` so revision snapshot runner (`configRevision` = `updatedAt` lúc runner khởi động) với profile đã lưu; không lấy được revision → trạng thái chưa xác định.
- Kiểm chứng: `npm test -- tests/manager.test.ts tests/runner-control.test.ts tests/build.test.ts`; `npm run typecheck`; `npm run build`. Smoke: Manager sandbox không lỗi `require`/`exports`, website không thấy bridge Manager.

### P5-T2 — Lưu, launch, shortcut và xóa an toàn (P5-03…P5-05, P5-07, P5-08)

- Create/update theo whitelist: giữ ID/createdAt/userAgent và mọi checkbox `false`; lưu registry xong mới sync shortcut; trả `{ profile, shortcut, restartRequired }` với lỗi từng phần riêng.
- Launch bằng argument array, process tách rời, xử lý spawn error; đường cài dùng lại phase 4; đóng Manager không đóng runner; mở lặp restore đúng profile (single-instance lock hiện có).
- Delete: xác nhận runner dừng thật (không coi ACK là đã dừng, kiểm tra PID còn sống; unknown/timeout → chặn) → gỡ shortcut → xóa registry, giữ session. Lỗi từng bước báo đúng bước và cho retry; registry ghi lỗi sau khi gỡ shortcut thành công → profile còn trong danh sách + thông báo đã gỡ shortcut + cho đồng bộ lại.
- ID có session giữ lại không được tái sử dụng (`ProfileDataExistsError` đã có); xóa session là API/hành động riêng, xác nhận native do main quản lý, validate mục tiêu + runner dừng + đường dẫn thuộc app (chống path traversal).
- Kiểm chứng: `npm test -- tests/manager.test.ts tests/profile-manager.test.ts tests/runner-control.test.ts tests/desktop-service.test.ts`.

### P5-T3 — Icon có giới hạn (P5-09)

- `icon-fetcher.ts`: chỉ HTTP(S), validate từng redirect (tối đa 5, chặn đổi protocol không an toàn), timeout tổng 5000 ms (AbortController), đếm byte thực tế khi đọc stream (trần 2 MiB kể cả khi header thiếu/sai), decode + kiểm tra kích thước tối đa 1024×1024 + chuẩn hóa PNG bằng công cụ Electron hiện có trước khi lưu vào vùng icon app; không gửi cookie/Authorization của website.
- `chooseIcon` (dialog file) đi qua cùng kiểm tra ảnh; hủy dialog không coi là lỗi; SVG từ mạng không render inline; mọi thất bại trả fallback kèm lý do để UI trình bày.
- Favicon/apple-touch-icon: resolve URL tương đối theo trang profile; URL nội bộ do người dùng chủ động cấu hình vẫn cho phép.
- Kiểm chứng: `npm test -- tests/icon-fetcher.test.ts tests/manager.test.ts`.

### P5-T4 — Dashboard và thử XPath (P5-02, P5-03, P5-06, P5-10)

- Cards/search/loading/empty/error; status refresh khi hiển thị, dừng timer khi ẩn/đóng; không nội suy dữ liệu profile vào `innerHTML` (dùng `textContent`).
- Form thêm dùng defaults từ mô hình hiện có; form sửa nạp đủ mode/interval/icon/5 checkbox; lỗi lưu giữ dữ liệu; partial shortcut failure báo phần đã lưu; config thay đổi hiện trạng thái cần mở lại từ revision.
- Thử XPath bằng ID đã lưu + selector/mode đang nhập; profile chưa mở → hướng dẫn mở/đăng nhập; kết quả document cũ (sau navigation) bị bỏ; không đổi baseline/config, không tạo attention. Mã kết quả dùng enum hiện có, chỉ Việt hóa nhãn UI.
- An toàn UI: tên chứa HTML hiển thị literal; CSP asset local; label/focus/Escape/focus-return; theme hệ thống + lựa chọn thủ công.
- Kiểm chứng: `npm test -- tests/manager.test.ts tests/runner-control-xpath.test.ts tests/xpath-evaluator.test.ts`. DOM mock không thay thế nghiệm thu Electron/Zalo thật.

### P5-T5 — Tích hợp, phân phối và báo cáo (P5-11, P5-12)

- Chuỗi GUI: thêm A/B → mở/đăng nhập riêng → thử XPath → nhận cảnh báo → focus clear → shortcut → mở lặp → sửa → xóa giữ session; xác nhận A focus không xóa badge B, Manager restart không đóng runner; thêm upload/download, clipboard, mic/cam grant-deny, session sau restart; fault: JSON hỏng, lỗi ghi/mạng, runner crash, socket cũ, tháo màn hình.
- Từ checkout sạch: `npm ci`, `npm run typecheck`, `npm run build`, `npm test`; smoke bản phân phối (đường cài, preload/assets/runtime, sandbox thật).
- Ma trận desktop trong spec: điền kết quả quan sát thực kèm distro/desktop/version, Electron/Chromium, backend, extension tray/dock, notification service, DND; giữ "Chưa kiểm thử" khi không truy cập display; "Không hỗ trợ" cần bằng chứng.
- Ghi `docs/verification.md` (mã P4/P5, commit, phiên bản, lệnh/thao tác, kết quả, bằng chứng); không thay kết quả desktop bằng số lượng unit test.
- Gate đóng phase: P5-01…P5-12 có task + bằng chứng; R03–R06 đã xử lý ở runtime (xem research.md) — smoke Electron xác minh event thực trước nghiệm thu phần phụ thuộc.

## Complexity Tracking

> Không có vi phạm Constitution Check cần biện minh — bảng này để trống theo quy định (chỉ điền khi có vi phạm).
