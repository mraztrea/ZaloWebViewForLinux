# Implementation Plan: Khởi tạo dự án và Nền tảng phát triển (001-project-init)

**Branch**: `001-project-init` | **Date**: 2026-09-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification từ [specs/001-project-init/spec.md](spec.md) và tài liệu kiến trúc tại [docs/](../../docs).

---

## Summary

Thiết lập toàn bộ hạ tầng cơ sở và nền tảng phát triển cho Linux Webview Manager (Task 1 trong tài liệu 8 task).
Dự án sử dụng **Electron v44.x** ổn định trên nhân Linux Wayland/X11, **Node.js v22.x**, **TypeScript v5.8+**, kịch bản đóng gói đa mục tiêu bằng **esbuild** (tách bạch hoàn toàn ranh giới giữa Main process, Preload sandbox và Renderer browser), bộ kiểm thử tự động **Vitest**, script thực thi dòng lệnh độc lập **`bin/zaloview.js`** tự phân giải đường dẫn gốc, và điểm khởi nhập tối thiểu **`src/main/index.ts`** có bộ phân tích đối số dòng lệnh `--manager` và `--profile <id>`.

---

## Technical Context

**Language/Version**: TypeScript 5.8+, Node.js 22.x

**Primary Dependencies**: Electron 44.x, esbuild 0.25+, vitest 3.x/5.x

**Storage**: N/A cho Task 1 (chuẩn bị cấu trúc lưu trữ XDG cho Task 2)

**Testing**: Vitest (chế độ Node và JSDOM)

**Target Platform**: Linux x86_64 (KDE Plasma 6 / GNOME 4x trên Wayland và X11)

**Project Type**: Linux Desktop Application (Kiến trúc đa tiến trình Electron)

**Performance Goals**: Đóng gói build < 1s, khởi động launcher < 500ms, toàn bộ kiểm thử chạy < 2s

**Constraints**:
- Tuân thủ nghiêm ngặt ranh giới sandbox: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Launcher độc lập với `process.cwd()`, bảo toàn toàn bộ đối số dòng lệnh và mã thoát.
- Kịch bản build không nuốt lỗi qua `2>/dev/null` hoặc `catch` rỗng.

**Scale/Scope**: Task 1 (Build, runtime, dependencies, launcher và entry point cơ bản).

---

## Constitution Check

*GATE: Phải vượt qua trước Phase 0 research. Đánh giá lại sau Phase 1 design.*

| Cổng kiểm soát (Gate) | Tiêu chuẩn đánh giá | Kết quả đánh giá | Ghi chú |
| :--- | :--- | :---: | :--- |
| **G-1: An toàn Sandbox** | Preload phải đóng gói độc lập, không dùng require nội bộ khi sandbox bật; renderer không truy cập Node APIs | **ĐẠT (PASS)** | `esbuild` cấu hình phân vùng riêng, preload dạng CJS bundle, renderer dạng browser bundle. |
| **G-2: Độc lập Launcher** | Launcher phải chạy được từ mọi CWD, chuyển tiếp tham số và mã lỗi đầy đủ | **ĐẠT (PASS)** | Phân giải `appRoot` qua vị trí tệp `bin/zaloview.js`, spawn tiến trình Electron kèm mã thoát. |
| **G-3: Khóa Phiên bản & Khả năng Tái lặp** | Dependencies phải khóa chặt trong `package-lock.json`, không yêu cầu sudo để build/chạy | **ĐẠT (PASS)** | Ghi rõ engine Node >= 22, Electron 44.x, quản lý hoàn toàn ở cấp độ người dùng bình thường. |
| **G-4: Chất lượng Mã nguồn** | Kiểm tra kiểu nghiêm ngặt (`tsc --noEmit`), kiểm thử tự động đạt 100% | **ĐẠT (PASS)** | Tích hợp script `typecheck` và `test` vào quy trình CI/kiểm thử cục bộ. |

---

## Project Structure

### Documentation (this feature)

```text
specs/001-project-init/
├── spec.md              # Đặc tả yêu cầu tính năng (Đã hoàn thành)
├── checklists/
│   └── requirements.md  # Bảng kiểm tra chất lượng yêu cầu (Đã hoàn thành)
├── plan.md              # Kế hoạch triển khai kiến trúc (Tệp này)
├── research.md          # Kết quả nghiên cứu kỹ thuật Phase 0 (Đã hoàn thành)
├── data-model.md        # Mô hình dữ liệu và thực thể Phase 1 (Đã hoàn thành)
├── quickstart.md        # Hướng dẫn kiểm chứng đầu cuối Phase 1 (Đã hoàn thành)
├── contracts/           # Quy chuẩn giao diện Phase 1 (Đã hoàn thành)
│   ├── cli-launcher.md
│   ├── build-pipeline.md
│   └── npm-scripts.md
└── tasks.md             # Danh sách công việc triển khai Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
bin/
└── zaloview.js                 # Launcher CLI thực thi độc lập CWD
scripts/
└── build.mjs                   # Kịch bản đóng gói esbuild đa mục tiêu
src/
├── main/
│   ├── index.ts                # Entry point chính của Electron, bộ phân tích CLI
│   └── cli.ts                  # Logic phân tích và xác thực đối số dòng lệnh
├── preload/
│   └── webview-preload.ts      # Preload script cho runner webview (sandbox an toàn)
├── renderer/
│   └── manager/
│       ├── index.html          # Trang HTML bảng điều khiển quản trị tối thiểu
│       ├── styles.css          # Định dạng giao diện ban đầu
│       └── app.ts              # Mã TypeScript giao diện độc lập với Node
└── shared/
    └── types.ts                # Định nghĩa kiểu dữ liệu dùng chung (CLI, Profile, Config)
tests/
├── cli.test.ts                 # Kiểm thử logic phân tích dòng lệnh và cờ
└── build.test.ts               # Kiểm thử tính toàn vẹn của tệp phân phối và sandbox
package.json                    # Cấu hình dự án, dependencies và script vòng đời
package-lock.json               # Tệp khóa phiên bản dependencies chính xác
tsconfig.json                   # Cấu hình kiểm tra kiểu tĩnh TypeScript nghiêm ngặt
vitest.config.ts                # Cấu hình khung kiểm thử Vitest
```

**Structure Decision**: Cấu trúc phân tách rõ ràng 3 vùng tiến trình của Electron (`main`, `preload`, `renderer`) kết hợp với thư mục `shared` cho các kiểu dữ liệu dùng chung. Quy cách tổ chức này bám sát thiết kế chuẩn tại [design_specification.md](../../docs/design_specification.md) và [detailed_tasks_plan.md](../../docs/detailed_tasks_plan.md).

---

## Complexity Tracking

Không có vi phạm hay ngoại lệ nào so với nguyên tắc thiết kế chuẩn; không cần biện minh độ phức tạp bổ sung.
