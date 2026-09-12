# Implementation Plan: Nền tảng Runner và Quản lý Dữ liệu Phiên (002-runner-data-platform)

**Branch**: `002-runner-data-platform` | **Date**: 2026-09-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification từ [specs/002-runner-data-platform/spec.md](spec.md), tài liệu kiến trúc tại [docs/](../../docs) và kết quả nghiên cứu kỹ thuật tại [research.md](research.md).

---

## Summary

Hiện thực hóa **Phase 1: Runner, dữ liệu và nền tảng Linux** (bao gồm toàn bộ Task 2 và Task 3 trong tài liệu 8 task).
Dự án triển khai:
1. Module lưu trữ cấu hình tập trung (`ProfileManager`) với cơ chế kiểm tra tính hợp lệ dữ liệu (schema validation), cơ chế ghi tệp nguyên tử (atomic write qua tệp tạm và rename) tuân thủ tiêu chuẩn XDG, chống hỏng dữ liệu khi gặp lỗi cú pháp JSON, và quản lý lưu trữ trạng thái cửa sổ độc lập (`window-state.json`).
2. Module dịch vụ cửa sổ (`WindowService`) khởi chạy cửa sổ native cho từng profile không thanh địa chỉ/menu trình duyệt, thiết lập định danh ứng dụng Linux (`app.setDesktopName`), kẹp tọa độ màn hình an toàn (screen boundary clamping), và áp dụng chính sách bảo mật sandbox nghiêm ngặt (`contextIsolation`, `sandbox`, kiểm soát quyền camera/mic theo origin, chặn điều hướng ngoại vi).
3. Cơ chế cách ly dữ liệu phiên duyệt web (`session.fromPartition('persist:zaloview_' + id)`) và khóa đơn phiên độc lập theo từng profile (per-profile single-instance lock), cho phép chạy đồng thời nhiều profile và khôi phục (restore/show/focus) cửa sổ khi mở lại.
4. Kênh giao tiếp điều khiển cục bộ (`RunnerControl`) sử dụng Unix Domain Socket phân quyền an toàn, hỗ trợ truy vấn `status`, yêu cầu `shutdown` an toàn và tự động dọn dẹp socket mồ côi (stale socket).

---

## Technical Context

**Language/Version**: TypeScript 5.8+ (Strict mode), Node.js >= 22.0.0

**Primary Dependencies**: Electron >= 44.3.0, esbuild >= 0.25.0, vitest >= 3.0.0; sử dụng tối đa thư viện chuẩn Node.js (`node:fs`, `node:path`, `node:net`, `node:os`, `node:crypto`).

**Storage**:
- Cấu hình chung: `$XDG_CONFIG_HOME/zaloview/profiles.json` (quyền 0600)
- Thư mục phiên và dữ liệu mỗi profile: `$XDG_DATA_HOME/zaloview/profiles/<id>/` (quyền 0700)
- Trạng thái cửa sổ: `$XDG_DATA_HOME/zaloview/profiles/<id>/window-state.json`
- Lưu trữ quyền thiết bị: `$XDG_DATA_HOME/zaloview/profiles/<id>/permissions.json`

**Testing**: Vitest (Unit tests cho `ProfileManager`, `RunnerControl`, `WindowService` và integration CLI tests)

**Target Platform**: Linux x86_64 (KDE Plasma 6 / GNOME 4x trên Wayland và X11)

**Project Type**: Linux Desktop Application (Kiến trúc đa tiến trình Electron độc lập)

**Performance Goals**:
- Khởi chạy cửa sổ profile: < 2.5 giây
- Khôi phục cửa sổ khi mở lần hai (second-instance): < 500 ms
- Đọc / ghi nguyên tử cấu hình: < 20 ms
- Phản hồi socket điều khiển: < 15 ms

**Constraints**:
- Tuân thủ nghiêm ngặt bảo mật Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Khóa đơn phiên độc lập theo từng profile; mở profile A không chiếm khóa profile B.
- JSON hỏng phải báo lỗi rõ ràng và bảo toàn tệp gốc, không tự ý ghi đè danh sách rỗng.
- Runner chỉ đọc cấu hình chung, không ghi đè `profiles.json` lúc đóng.

**Scale/Scope**: Phase 1 (Runner, lưu trữ cấu hình, phân vùng dữ liệu phiên và nền tảng Linux).

---

## Constitution Check

*GATE: Phải vượt qua trước Phase 0 research. Đánh giá lại sau Phase 1 design.*

| Cổng kiểm soát (Gate) | Tiêu chuẩn đánh giá | Kết quả đánh giá | Ghi chú |
| :--- | :--- | :---: | :--- |
| **G-1: Cách ly Phiên & Bảo mật Sandbox** | Các profile phải có vùng lưu trữ riêng biệt; sandbox bật đầy đủ; permission check/request theo origin | **ĐẠT (PASS)** | Partition persist độc lập, `contextIsolation` & `sandbox` bật, mic/cam yêu cầu xác nhận origin. |
| **G-2: Bảo toàn Dữ liệu & Ghi Nguyên tử** | Tệp cấu hình ghi qua file tạm + fsync + rename; file lỗi không bị ghi đè dữ liệu rỗng | **ĐẠT (PASS)** | Triển khai giao thức atomic write chuẩn POSIX trong `ProfileManager`, ném lỗi `ProfileRegistryCorruptError` bảo toàn file gốc. |
| **G-3: Khóa Đơn phiên Đúng phạm vi** | Single-instance lock theo từng profile; hỗ trợ chạy đa profile đồng thời | **ĐẠT (PASS)** | Đặt `userData` theo profile trước khi gọi `requestSingleInstanceLock()`. |
| **G-4: Vòng đời & Kênh Điều khiển An toàn** | Socket cục bộ quyền 0600; xử lý stale socket; thoát an toàn giải phóng tài nguyên | **ĐẠT (PASS)** | Sử dụng Unix domain socket trong thư mục runtime/userData, kiểm tra kết nối trước khi dọn stale socket. |
| **G-5: Chất lượng Mã nguồn & Kiểm thử** | Mã nguồn không có lỗi TypeScript (`tsc --noEmit`), test coverage đầy đủ các luồng chính và biên | **ĐẠT (PASS)** | Thiết kế bộ test tự động toàn diện cho logic lưu trữ, socket protocol và quản lý cửa sổ. |

---

## Project Structure

### Documentation (this feature)

```text
specs/002-runner-data-platform/
├── spec.md              # Đặc tả yêu cầu tính năng (Đã hoàn thành)
├── checklists/
│   └── requirements.md  # Bảng kiểm tra chất lượng yêu cầu (Đã hoàn thành)
├── plan.md              # Kế hoạch triển khai kiến trúc (Tệp này)
├── research.md          # Kết quả nghiên cứu kỹ thuật Phase 0 (Đã hoàn thành)
├── data-model.md        # Mô hình dữ liệu và thực thể Phase 1 (Đã hoàn thành)
├── quickstart.md        # Hướng dẫn kiểm chứng đầu cuối Phase 1 (Đã hoàn thành)
├── contracts/           # Quy chuẩn giao diện Phase 1 (Đã hoàn thành)
│   ├── profile-storage.md
│   ├── runner-control-socket.md
│   └── window-service.md
└── tasks.md             # Danh sách công việc triển khai Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── index.ts                # Entry point chính của Electron, điều phối CLI mode
│   ├── cli.ts                  # Logic phân tích và xác thực đối số dòng lệnh
│   ├── profile-manager.ts      # Quản lý cấu hình, validation, atomic write & window-state
│   ├── runner-control.ts       # Unix domain socket server điều khiển status/shutdown
│   └── window-service.ts       # Quản lý BrowserWindow, bounds clamping & security policies
├── preload/
│   └── webview-preload.ts      # Preload script cho runner webview (sandbox an toàn)
├── renderer/
│   └── manager/
│       ├── index.html          # Trang HTML bảng điều khiển quản trị tối thiểu
│       ├── styles.css          # Định dạng giao diện ban đầu
│       └── app.ts              # Mã TypeScript giao diện độc lập với Node
└── shared/
    └── types.ts                # Định nghĩa kiểu dữ liệu dùng chung (Profile, WindowState, Socket)
tests/
├── cli.test.ts                 # Kiểm thử phân tích CLI
├── profile-manager.test.ts     # Kiểm thử đọc/ghi nguyên tử, validation, JSON corruption
├── runner-control.test.ts      # Kiểm thử Unix domain socket protocol, status, shutdown, stale cleanup
├── window-service.test.ts      # Kiểm thử screen bounds clamping, security options
└── build.test.ts               # Kiểm thử tính toàn vẹn của tệp phân phối và sandbox
```

**Structure Decision**: Cấu trúc đơn dự án (Single project structure) được tối ưu cho Electron desktop app, phân tách rõ ràng các tầng trách nhiệm: `main` (hệ thống, filesystem, tiến trình, socket, bảo mật), `shared` (hợp đồng dữ liệu và kiểu TypeScript), `preload` (cầu nối bảo mật sandbox), và `tests` (bộ kiểm thử tự động).

---

## Complexity Tracking

> Không có vi phạm kiến trúc nào cần phải biện minh. Thiết kế bám sát nguyên tắc Tối giản (YAGNI & Simplicity), tận dụng tối đa API native của Node.js và Electron mà không cài đặt thêm các thư viện thứ 3 không cần thiết.
