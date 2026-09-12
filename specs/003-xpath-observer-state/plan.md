# Implementation Plan: XPath Observer và Quản lý Trạng thái (Phase 2)

**Branch**: `003-xpath-observer-state` | **Date**: 2026-09-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-xpath-observer-state/spec.md`

---

## Summary

Hiện thực hóa **Phase 2 (Task 4)** trong lộ trình ZaloWebView: Xây dựng bộ công cụ giám sát DOM chính xác bên trong webview runner bằng cách kết hợp `MutationObserver` thời gian thực và quét dự phòng định kỳ; trích xuất dữ liệu thông báo qua 3 chế độ (`existence`, `badge_count`, `text_content`); thiết lập bộ so sánh trạng thái và theo dõi baseline chuỗi thời gian ngăn ngừa cảnh báo giả; thiết lập giao thức IPC an toàn giữa Main Process và Preload; mở rộng kênh Unix domain socket của runner phục vụ chức năng thử nghiệm bộ chọn XPath thủ công (`test-xpath`) với lớp phủ highlight trực quan tạm thời.

---

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js `>= 22.0.0`, Electron `>= 44.3.0`, ECMAScript 2022 Target, Strict mode)

**Primary Dependencies**: Electron API (`BrowserWindow`, `WebContents`, `ipcMain`, `ipcRenderer`, `contextBridge`), Node.js Core Modules (`node:net`, `node:fs`, `node:path`, `node:crypto`), DOM Level 3 XPath API (`document.evaluate`, `MutationObserver`). Không thêm thư viện phụ thuộc bên thứ 3 nào mới (tuân thủ YAGNI & Simplicity).

**Storage**: Bộ nhớ RAM trong phiên chạy (In-memory baseline tracking trong Preload và trạng thái profile trong Main). Kế thừa cấu hình profile từ `ProfileManager` đã xây dựng ở Phase 1.

**Testing**: Vitest (`npx vitest run`), `happy-dom` / giả lập DOM cho các unit test của `XPathEvaluator` và `compareWithBaseline`, integration test cho IPC và socket control.

**Target Platform**: Linux Desktop (X11 & Wayland, KDE Plasma & GNOME).

**Project Type**: Linux Desktop Application (Electron Multi-process: Main, Preload Sandbox, Webview Renderer).

**Performance Goals**:
- Thời gian trích xuất và xử lý XPath: < 10 ms cho mỗi lần quét.
- Khoảng trễ gom nhóm đột biến DOM (Debounce): 300 ms.
- Thử nghiệm XPath thủ công: phản hồi < 200 ms trên trang web thông thường.
- Mức tiêu thụ CPU của observer khi trang tĩnh hoặc selector rỗng: xấp xỉ 0%.

**Constraints**:
- Preload chạy trong môi trường bảo vệ: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Xác thực nghiêm ngặt nguồn gốc thông điệp IPC: Chỉ chấp nhận từ `mainFrame`, đúng origin của profile.
- Giới hạn preview IPC tối đa 500 ký tự; so sánh text đầy đủ trước khi cắt.
- Không được làm gián đoạn hoặc reset baseline khi cửa sổ focus.

**Scale/Scope**: Quản lý nhiều profile runner độc lập chạy song song, mỗi runner duy trì bộ giám sát DOM và kênh điều khiển socket riêng biệt.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Nguyên tắc Tối giản & YAGNI**: Tận dụng triệt để `document.evaluate` và `MutationObserver` có sẵn của Chromium trong Electron; không cài thêm thư viện parser DOM hay xpath cồng kềnh.
- [x] **Cô lập & An toàn Môi trường**: Giữ nguyên `contextIsolation: true`, `sandbox: true`; chỉ trao đổi dữ liệu qua các kênh IPC có xác thực frame/origin rõ ràng (`xpath:init`, `xpath:state`, `xpath:error`, `xpath:test`, `xpath:test-result`).
- [x] **Bảo toàn Tài liệu & Hợp đồng Kế hoạch**: Tuân thủ chuẩn xác hợp đồng Phase 2 và Task 4 đã nêu trong `docs/phased_implementation_plan.md` và `docs/detailed_tasks_plan.md`.
- [x] **Xác minh Trước Khi Hoàn Tất**: Đảm bảo toàn bộ mã nguồn biên dịch sạch (`npm run typecheck`), vượt qua tất cả kiểm thử (`npm test`).

---

## Project Structure

### Documentation (this feature)

```text
specs/003-xpath-observer-state/
├── checklists/
│   └── requirements.md         # Quality checklist for spec
├── contracts/
│   ├── xpath-ipc.md            # Interface contract for IPC (Main <-> Preload)
│   ├── runner-socket-test-xpath.md # Interface contract for socket test-xpath
│   └── xpath-evaluator.md      # Internal evaluator module contract
├── data-model.md               # Data entities, validation rules, state transitions
├── plan.md                     # This implementation plan
├── quickstart.md               # Quickstart validation & run guide
├── research.md                 # Technical decisions and trade-offs
└── spec.md                     # Feature specification
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── cli.ts
│   ├── index.ts                # [MODIFY] Nối IPC xpath:state/xpath:error/xpath:test, gắn handler
│   ├── runner-control.ts       # [MODIFY] Hỗ trợ action 'test-xpath' chuyển tiếp tới window
│   ├── window-service.ts       # [MODIFY] Quản lý lifecycle webContents gửi xpath:init khi load xong
│   ├── profile-manager.ts
│   └── xdg-paths.ts
├── preload/
│   ├── xpath-evaluator.ts      # [NEW] DOM evaluation, parsing (existence/badge/text), baseline comparison, highlight
│   └── webview-preload.ts      # [MODIFY] MutationObserver, debouncing 300ms, polling fallback, IPC listeners
└── shared/
    └── types.ts                # [MODIFY] Bổ sung kiểu XPathObservationState, XPathEvaluationResult, TestRequest

tests/
├── xpath-evaluator.test.ts     # [NEW] Unit test cho xpath evaluation, badge parsing, baseline comparison
├── runner-control-xpath.test.ts # [NEW] Integration test cho action test-xpath qua socket & IPC
└── ... (các test Phase 1 giữ nguyên)
```

**Structure Decision**: Kiến trúc đa tiến trình chuẩn của Electron với `src/shared` chứa các kiểu dữ liệu dùng chung, `src/preload` chứa logic thao tác trực tiếp trên DOM của webview, `src/main` điều phối phiên và socket điều khiển.

---

## Complexity Tracking

*Không có vi phạm nguyên tắc kiến trúc hoặc độ phức tạp không cần thiết.*
