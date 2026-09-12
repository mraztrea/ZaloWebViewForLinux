# Tasks: Khởi tạo dự án và Nền tảng phát triển (001-project-init)

**Input**: Đặc tả tính năng từ [spec.md](spec.md), kế hoạch triển khai từ [plan.md](plan.md), mô hình dữ liệu từ [data-model.md](data-model.md), và các hợp đồng tại [contracts/](contracts/).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Khởi tạo cấu trúc dự án, cấu hình quản lý phụ thuộc, kiểm tra kiểu tĩnh và khung kiểm thử tự động.

- [X] T001 Khởi tạo cấu hình dự án `package.json` với engines Node `>= 22.0.0`, dependencies (`electron: ^44.0.0`), devDependencies (`typescript: ^5.8.0`, `esbuild: ^0.25.0`, `vitest: ^3.0.0`, `@types/node: ^22.0.0`) và các lệnh vòng đời trong package.json
- [X] T002 Cài đặt các gói phụ thuộc và tạo tệp khóa phiên bản `package-lock.json` qua `npm install` trong package-lock.json
- [X] T003 [P] Cấu hình trình biên dịch TypeScript với `strict: true`, `noImplicitAny: true`, `target: ES2022`, `moduleResolution: NodeNext` trong tsconfig.json
- [X] T004 [P] Cấu hình khung kiểm thử tự động Vitest hỗ trợ môi trường node và jsdom trong vitest.config.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Hạ tầng kiểu dữ liệu dùng chung và khung tài nguyên cơ bản bắt buộc trước khi triển khai các User Story.

**⚠️ CRITICAL**: Phải hoàn thành Phase này trước khi bắt đầu triển khai các User Story.

- [X] T005 [P] Tạo các định nghĩa kiểu dữ liệu dùng chung (`CommandLineArgs` với `mode: 'manager' | 'profile'`, `profileId: string | null` tuân thủ constraint `^[a-z0-9]+(?:-[a-z0-9]+)*$` độ dài 1..64 ký tự, `BuildTargetConfig`, `LauncherProcessState`) trong src/shared/types.ts
- [X] T006 [P] Tạo tệp tài nguyên tĩnh ban đầu và khung giao diện manager tối thiểu trong assets/default-icon.png, src/renderer/manager/index.html và src/renderer/manager/styles.css

**Checkpoint**: Nền tảng cốt lõi sẵn sàng - quá trình triển khai User Stories có thể bắt đầu.

---

## Phase 3: User Story 1 - Khởi tạo môi trường từ bản sao chép sạch (Priority: P1) 🎯 MVP

**Goal**: Cho phép nhà phát triển clone kho mã nguồn và chạy toàn bộ quy trình kiểm tra tự động (`typecheck`, `build`, `test`) thành công 100% bằng các lệnh chuẩn hóa.

**Independent Test**: Chạy `npm ci`, `npm run typecheck`, `npm run build`, `npm test` từ checkout sạch đạt 100% không phát sinh lỗi biên dịch hay cảnh báo kiểu.

### Tests for User Story 1 ⚠️

- [X] T007 [P] [US1] Viết unit test kiểm tra tính hợp lệ của manifest `package.json`, các script vòng đời bắt buộc và file khóa lockfile trong tests/setup.test.ts

### Implementation for User Story 1

- [X] T008 [US1] Triển khai kịch bản đóng gói đa mục tiêu bằng esbuild cho main, preload và renderer theo hợp đồng `contracts/build-pipeline.md` trong scripts/build.mjs
- [X] T009 [US1] Triển khai logic sao chép tài nguyên tĩnh (HTML, CSS, assets) vào thư mục `dist/` mà không nuốt lỗi biên dịch trong scripts/build.mjs
- [X] T010 [US1] Tạo tệp mã nguồn TypeScript tối thiểu cho giao diện manager hoàn toàn không chứa API Node đặc quyền trong src/renderer/manager/app.ts
- [X] T011 [US1] Xác minh chuỗi kiểm tra tự động (`npm run typecheck`, `npm run build`, `npm test`) hoạt động hoàn tất từ đầu đến cuối

**Checkpoint**: User Story 1 hoàn thành độc lập và cung cấp nền tảng MVP cho toàn bộ quá trình phát triển.

---

## Phase 4: User Story 2 - Khởi chạy ứng dụng qua công cụ dòng lệnh độc lập (Priority: P1)

**Goal**: Cung cấp script launcher `bin/zaloview.js` tự phân giải thư mục gốc độc lập với `cwd`, chuyển tiếp nguyên vẹn tham số `--manager` hoặc `--profile <id>` và mã thoát.

**Independent Test**: Gọi launcher từ một thư mục bất kỳ bên ngoài (ví dụ `/tmp` hoặc `~`) với các cờ `--help`, `--version`, `--profile test-profile`, xác minh tiến trình nhận đúng tham số và trả mã lỗi phù hợp.

### Tests for User Story 2 ⚠️

- [X] T012 [P] [US2] Viết unit test cho bộ phân tích đối số dòng lệnh `CommandLineParser` kiểm tra `--manager`, `--profile <id>`, kiểm tra cờ lạ và xung đột cờ trong tests/cli.test.ts

### Implementation for User Story 2

- [X] T013 [US2] Triển khai module phân tích và xác thực đối số dòng lệnh `CommandLineParser` tuân thủ quy tắc trong `contracts/cli-launcher.md` tại src/main/cli.ts
- [X] T014 [US2] Triển khai script launcher `bin/zaloview.js` phân giải `appRoot` qua `__dirname`, định vị binary Electron và spawn tiến trình con chuyển tiếp arguments, stdio, signals và exit code trong bin/zaloview.js
- [X] T015 [US2] Cấp quyền thực thi (`chmod +x`) và thiết lập xử lý lỗi thiếu runtime hoặc đường dẫn chứa khoảng trắng trong bin/zaloview.js
- [X] T016 [US2] Triển khai điểm khởi nhập chính của ứng dụng Electron tiếp nhận đối số từ CLI và điều phối luồng chạy trong src/main/index.ts

**Checkpoint**: User Story 2 hoàn thành độc lập - ứng dụng có thể kích hoạt qua launcher từ bất kỳ vị trí nào trên hệ thống Linux.

---

## Phase 5: User Story 3 - Quy trình đóng gói an toàn theo ranh giới bảo mật (Priority: P2)

**Goal**: Đảm bảo quy trình biên dịch tự động tách biệt ranh giới bảo mật giữa Main, Preload sandbox và Renderer browser, đóng gói preload thành bundle khép kín không rò rỉ require nội bộ.

**Independent Test**: Quét các tệp bundle `dist/preload/webview-preload.js` và `dist/renderer/manager/app.js`, xác nhận không có module Node nào bị rò rỉ vào renderer và preload nạp an toàn khi bật `sandbox: true`.

### Tests for User Story 3 ⚠️

- [X] T017 [P] [US3] Viết unit test kiểm chứng ranh giới sandbox và kiểm tra nội dung phân phối trong thư mục `dist/` trong tests/build.test.ts

### Implementation for User Story 3

- [X] T018 [US3] Triển khai preload script tối thiểu an toàn cho webview hỗ trợ `contextIsolation: true` và `sandbox: true` trong src/preload/webview-preload.ts
- [X] T019 [US3] Cấu hình mục tiêu preload trong esbuild để đóng gói toàn bộ dependencies nội bộ thành bundle CommonJS khép kín với `external: ['electron']` trong scripts/build.mjs
- [X] T020 [US3] Cấu hình mục tiêu renderer trong esbuild để đóng gói dạng browser độc lập (`platform: 'browser'`, `format: 'iife'`) không chứa module Node trong scripts/build.mjs

**Checkpoint**: Cả 3 User Stories đều hoàn thành độc lập và ranh giới bảo mật sandbox được bảo đảm tuyệt đối.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Hoàn thiện tài liệu dự án và xác thực toàn diện theo hướng dẫn kiểm chứng.

- [X] T021 [P] Cập nhật tài liệu hướng dẫn phát triển và khởi động ứng dụng trong README.md
- [X] T022 Thực hiện kiểm chứng toàn diện theo kịch bản trong specs/001-project-init/quickstart.md và ghi nhận kết quả nghiệm thu

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Không phụ thuộc - có thể bắt đầu ngay.
- **Foundational (Phase 2)**: Phụ thuộc vào Setup - KHÓA toàn bộ User Stories.
- **User Stories (Phases 3, 4, 5)**: Tất cả phụ thuộc vào Foundational Phase hoàn tất.
  - User Story 1 (P1 - MVP): Triển khai đầu tiên.
  - User Story 2 (P1): Có thể triển khai song song hoặc ngay sau US1.
  - User Story 3 (P2): Triển khai củng cố ranh giới sandbox cho build pipeline.
- **Polish (Phase 6)**: Phụ thuộc vào cả 3 User Stories hoàn thành.

### User Story Dependencies

- **US1 (P1)**: Bắt đầu ngay sau Phase 2 - Tạo ra build pipeline và npm lifecycle scripts.
- **US2 (P1)**: Bắt đầu sau Phase 2 - Tạo ra launcher và CLI parser (kết nối với entry point tạo ở US1).
- **US3 (P2)**: Củng cố build pipeline của US1 với các cấu hình sandbox chuyên sâu cho preload và renderer.

### Parallel Opportunities

- **Trong Phase 1**: T003 (`tsconfig.json`) và T004 (`vitest.config.ts`) có thể thực hiện song song sau T001/T002.
- **Trong Phase 2**: T005 (`src/shared/types.ts`) và T006 (`assets/` và renderer HTML/CSS) có thể thực hiện song song.
- **Trong Phase 3 (US1)**: Test T007 có thể viết song song trước khi hoàn thiện implementation T008-T010.
- **Trong Phase 4 (US2)**: Test T012 có thể viết song song trước khi hoàn thiện CLI parser T013 và launcher T014.
- **Trong Phase 5 (US3)**: Test T017 có thể viết song song trước khi hoàn thiện T018-T020.

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2 + Phase 3: User Story 1)

1. Hoàn thành Phase 1 (Setup: `package.json`, cài đặt dependencies, cấu hình TS và Vitest).
2. Hoàn thành Phase 2 (Foundational: Kiểu dữ liệu `CommandLineArgs`, `BuildTargetConfig`, khung assets).
3. Hoàn thành Phase 3 (User Story 1: `scripts/build.mjs`, `src/renderer/manager/app.ts`, kiểm chứng `npm run typecheck`, `npm run build`, `npm test`).
4. **DỪNG VÀ XÁC MINH**: Kiểm chứng độc lập MVP — kho mã nguồn có thể cài đặt và build thành công từ một checkout sạch.

### Incremental Delivery (Tiếp nối User Story 2 & 3)

5. Triển khai User Story 2: `bin/zaloview.js`, `src/main/cli.ts`, `src/main/index.ts` -> Kiểm chứng độc lập launcher từ thư mục `/tmp` và `~`.
6. Triển khai User Story 3: Hoàn thiện sandbox preload và renderer bundle -> Kiểm chứng bảo mật sandbox.
7. Hoàn thiện Phase 6: Cập nhật `README.md` và kiểm thử toàn bộ theo `quickstart.md`.
