# Kế hoạch triển khai: Nhập/Xuất danh sách và cấu hình Profile

**Nhánh**: `009-profile-import-export` | **Ngày**: 2026-09-16 | **Đặc tả**: [spec.md](spec.md)

**Đầu vào**: Đặc tả tính năng từ `specs/009-profile-import-export/spec.md`; mô hình dữ liệu `specs/007-phase5-manager/data-model.md`; quy tắc kiểm tra `src/main/profile-validator.ts`; luồng lưu profile và icon `src/main/manager-handlers.ts`.

> Ghi chú: đây là tài liệu kế hoạch và thiết kế. Mọi lệnh kiểm chứng (`npm run typecheck`, `npm test`) chạy ở bước thực thi (`speckit-tasks` / `speckit-implement`), không phải ở bước này.

## Summary

Thêm hai thao tác **Xuất** và **Nhập** cho danh sách profile trong Manager Dashboard. Xuất ghi một tệp JSON chứa toàn bộ cấu hình profile (không gồm dữ liệu phiên đăng nhập), có nhúng icon base64. Nhập đọc tệp, kiểm tra từng profile bằng đúng quy tắc hiện hành, thêm các profile hợp lệ chưa tồn tại, bỏ qua profile trùng ID hoặc lỗi, rồi trả báo cáo chi tiết. Hướng tiếp cận: một module thuần mới `profile-transfer.ts` (build/parse payload, không chạm FS) để dễ test; hai method mới trên `ManagerService` điều phối dialog + đọc/ghi tệp + tái sử dụng `ProfileManager.createProfile`, `storeIconBuffer` và `syncShortcut` sẵn có; hai kênh IPC và hai nút UI. Không thêm dependency.

## Technical Context

**Language/Version**: TypeScript strict, Node.js `>= 22.0.0`, Electron `>= 44.3.0`

**Primary Dependencies**: Electron (`dialog`, `fs`, `path`, `crypto`), esbuild (`scripts/build.mjs`), Vitest. Không thêm dependency npm mới.

**Storage**: `profiles.json` qua `ProfileManager` + ghi nguyên tử (`atomic-writer.ts`); icon trong `resolveDataDir()/icons`; tệp xuất/nhập do người dùng chọn qua hộp thoại native.

**Testing**: Vitest cho module chuyển đổi thuần (`profile-transfer`) và cho `ManagerService` với dialog/FS giả; smoke thủ công trên Electron thật cho luồng UI.

**Target Platform**: Linux desktop (KDE Plasma / GNOME; X11 / Wayland)

**Project Type**: desktop-app (Electron: main process + sandbox renderer + preload bridge)

**Performance Goals**: Xuất/nhập hàng chục profile hoàn tất gần như tức thời (ngoài thời gian người dùng tương tác hộp thoại); đọc tệp nhập có trần 20 MiB; không chặn UI vì I/O nằm ở main.

**Constraints**: Renderer sandbox (`sandbox: true`, `nodeIntegration: false`, `contextIsolation: true`), chỉ gọi qua `window.zaloview`; mọi handler kiểm tra sender/frame/URL local và payload; không tin đường dẫn từ nội dung tệp; ghi tệp xuất nguyên tử; không chạm dữ liệu phiên của profile.

**Scale/Scope**: Ứng dụng local một người dùng, hàng chục profile; 1 module thuần mới, 2 method service, 2 kênh IPC, 2 nút UI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Không có tệp `.specify/memory/constitution.md` trong dự án nên các gate dưới đây được suy ra từ `AGENTS.md` và các đặc tả trước (`specs/007-phase5-manager/plan.md`):

- [x] **Tái sử dụng trước khi xây mới**: Dùng lại `ProfileManager.createProfile`, `validateProfile`, `storeIconBuffer`, `syncProfileShortcut`, `atomicWriteFile`, hộp thoại native và cầu nối Manager hiện có; không dựng cơ chế lưu trữ mới. — ĐẠT.
- [x] **Tối giản (YAGNI)**: Định dạng JSON thuần, không nén, không thêm dependency; không tạo abstraction thừa — chỉ một module thuần cho phần build/parse để test được. — ĐẠT.
- [x] **An toàn IPC**: Hai handler mới tuân thủ cùng `guard()` sender/frame/URL và whitelist trường payload như 11 kênh hiện có; `id` qua `validateProfileId`; `iconPath` từ tệp bị bỏ qua hoàn toàn; giới hạn kích thước tệp/icon. — ĐẠT.
- [x] **Không phá vỡ dữ liệu**: Nhập chỉ thêm mới, không ghi đè/xóa; tệp sai cấu trúc bị từ chối trước khi chạm registry; profile lỗi bị bỏ qua và báo cáo. — ĐẠT.
- [x] **Kiểm chứng**: Có unit test cho parse/build và test service cho luồng export/import với dialog giả; chạy `npm run typecheck` và `npm test`. — ĐẠT.
- [x] **Tài liệu tiếng Việt**: Mọi tài liệu specs/plan/research/data-model/contracts/quickstart viết bằng tiếng Việt. — ĐẠT.

*Re-check sau Phase 1 (xem cuối plan): thiết kế không phát sinh abstraction hay dependency mới, các gate giữ nguyên.*

## Project Structure

### Documentation (this feature)

```text
specs/009-profile-import-export/
├── plan.md              # Tệp này (kế hoạch + Technical Context + thiết kế)
├── research.md          # Phase 0: quyết định kỹ thuật và cơ sở
├── data-model.md        # Phase 1: mô hình dữ liệu tệp xuất và báo cáo nhập
├── quickstart.md        # Phase 1: hướng dẫn kiểm chứng đầu cuối
├── contracts/           # Phase 1: hợp đồng định dạng tệp + kênh IPC
│   └── profile-transfer.contract.md
└── tasks.md             # Phase 2 (speckit-tasks tạo, KHÔNG thuộc bước này)
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── profile-transfer.ts   # MỚI: build/parse payload thuần (không FS, không Electron)
│   ├── manager-handlers.ts   # THÊM: 2 kênh IPC + exportProfiles()/importProfiles() + deps dialog
│   ├── profile-manager.ts    # Dùng lại: createProfile (đã chặn ID trùng/phiên mồ côi)
│   ├── profile-validator.ts  # Dùng lại: validateProfile/validateProfileId
│   ├── atomic-writer.ts      # Dùng lại: ghi tệp xuất nguyên tử
│   ├── xdg-paths.ts          # Dùng lại: resolveDataDir (vùng icons)
│   └── index.ts              # Nối: wire showSaveDialog/showJsonOpenDialog
├── preload/
│   └── manager-preload.ts    # THÊM: exportProfiles()/importProfiles() vào window.zaloview
├── renderer/manager/
│   ├── app.ts                # THÊM: handler nút Nhập/Xuất + hiển thị báo cáo
│   ├── index.html            # THÊM: 2 nút trong header-actions
│   └── styles.css            # THÊM: style cho nút phụ (nếu cần)
└── shared/
    └── types.ts              # THÊM: ExportBundle, ExportedProfile, ImportReport, ExportResult

tests/
├── profile-transfer.test.ts  # MỚI: unit test build/parse thuần
└── manager.test.ts           # MỞ RỘNG: luồng exportProfiles/importProfiles với deps giả
```

**Structure Decision**: Giữ nguyên cấu trúc single-project hiện hữu của dự án (main / preload / renderer / shared + `tests/`). Không tạo tầng mới; chỉ thêm một module thuần ở `src/main/` và mở rộng các file sẵn có theo đúng pattern của tính năng 007.

## Complexity Tracking

> Không có vi phạm Constitution Check; không cần bảng theo dõi độ phức tạp.

## Thiết kế chi tiết

### 1. Module thuần `src/main/profile-transfer.ts`

Không import `electron`, không chạm FS. Chịu trách nhiệm chuyển đổi giữa `Profile` và payload JSON, kiểm tra cấu trúc tệp.

```ts
export const PROFILE_EXPORT_SCHEMA_VERSION = 1;
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;

export interface ExportedIcon { mimeType: string; data: string; }
export interface ExportedProfile {
  id: string; name: string; url: string;
  userAgent?: string;
  xpathConfig: XPathConfig;
  desktopConfig: DesktopIntegrationConfig;
  icon?: ExportedIcon;
}
export interface ExportBundle {
  schemaVersion: number;
  exportedAt: string;
  profiles: ExportedProfile[];
}

// Thuần: với mỗi profile, gọi iconReader(iconPath) -> Buffer | null
export function buildExportBundle(
  profiles: Profile[],
  iconReader: (iconPath: string) => Buffer | null,
  now?: Date
): ExportBundle;

export interface ParsedProfileEntry {
  id: string; name: string; url: string;
  userAgent?: string;
  xpathConfig: XPathConfig;
  desktopConfig: DesktopIntegrationConfig;
  iconBase64?: string;
}
export interface ParseImportResult {
  entries: ParsedProfileEntry[];
  invalid: { index: number; reason: string }[];
}
export function parseImportBundle(raw: string): ParseImportResult; // ném lỗi cấu trúc
```

- `buildExportBundle`: bỏ `iconPath`, `createdAt`, `updatedAt`; nhúng icon qua `iconReader` (lỗi trả `null` → bỏ icon).
- `parseImportBundle`: parse JSON (né̂u lỗi → ném `ProfileTransferError` cấu trúc); kiểm tra `schemaVersion === 1` và `profiles` là mảng (ném nếu sai); mỗi mục dùng `validateProfile` để chuẩn hóa rồi map sang `ParsedProfileEntry`; mục lỗi gom vào `invalid` với `index` (không chặn mục khác). `icon` chỉ nhận khi là object có `mimeType` chuỗi và `data` chuỗi phi rỗng.
- Trường lạ bị bỏ qua (chỉ đọc trường đã biết).

### 2. `ManagerService` (trong `manager-handlers.ts`)

Thêm hai dep hộp thoại (giữ `showOpenDialog` cũ cho icon):

```ts
showSaveDialog?: (defaultName: string) => Promise<string | null>;
showJsonOpenDialog?: () => Promise<string | null>;
```

- `exportProfiles(): Promise<ExportResult>`:
  1. Đọc registry qua `profileManager.loadRegistry()`; nếu rỗng → trả `{ cancelled: false, count: 0, path: '' }`? **Không** — spec yêu cầu báo "không có profile để xuất" và không ghi tệp. Trả `{ cancelled: true, reason: 'EMPTY' }` để renderer báo.
  2. `showSaveDialog('zaloview-profiles-YYYYMMDD.json')`; hủy → `{ cancelled: true }`.
  3. `buildExportBundle(profiles, readIconFn)` với `readIconFn` đọc file trong `iconDir` (kiểm tra path nằm trong iconDir; lỗi → `null`).
  4. `atomicWriteFile(path, JSON.stringify(bundle, null, 2))`; lỗi → `ManagerError('EXPORT_WRITE_FAILED', ...)`.
  5. Trả `{ cancelled: false, count, path }`.

- `importProfiles(): Promise<ImportReport>`:
  1. `showJsonOpenDialog()`; hủy → `{ cancelled: true, ... }` (empty report).
  2. `fs.statSync` kiểm tra `size <= MAX_IMPORT_FILE_BYTES`; vượt → `ManagerError('IMPORT_FILE_TOO_LARGE', ...)`.
  3. Đọc nội dung UTF-8; `parseImportBundle`; lỗi cấu trúc → `ManagerError('IMPORT_INVALID_FILE', ...)` (không đổi registry).
  4. Với mỗi `entry`: nếu `profileManager.getProfile(entry.id)` tồn tại → `skipped` lý do `ID_EXISTS`; ngược lại:
     - nếu `iconBase64`: `Buffer.from(base64, 'base64')`, kiểm tra `length <= ICON_MAX_BYTES`, `storeIconBuffer(buffer)`; nếu `fallback === true` → ghi `warnings` (`ICON_IGNORED`) và `iconPath = undefined`; nếu OK → `iconPath = result.path`.
     - `profileManager.createProfile({ id, name, url, userAgent, iconPath, xpathConfig, desktopConfig })`; bắt `ProfileDataExistsError` → `skipped` (`SESSION_DATA_EXISTS`); `ProfileValidationError`/`ProfileDuplicateIdError` → `invalid`; lỗi khác → `ManagerError`.
     - Thành công: `addedCount++`; gọi `syncShortcut(saved, launcherPath)` trong try/catch; lỗi → `warnings` (`SHORTCUT_FAILED`), không chặn.
  5. Trả `ImportReport { cancelled: false, addedCount, added, skipped, invalid, warnings }`.

- Các lỗi dùng `ManagerError` với code: `EXPORT_EMPTY`, `EXPORT_WRITE_FAILED`, `IMPORT_FILE_TOO_LARGE`, `IMPORT_INVALID_FILE`.

### 3. IPC + preload

```ts
// MANAGER_CHANNELS
exportProfiles: 'zaloview:export-profiles',
importProfiles: 'zaloview:import-profiles',
```

- Handler nhận đúng 0 tham số payload (không nhận đường dẫn từ renderer); `guard(event)` như các kênh khác.
- Preload thêm `exportProfiles(): Promise<ExportResult>` và `importProfiles(): Promise<ImportReport>` vào `ManagerBridgeApi` và object `api`.

### 4. Wiring `index.ts`

```ts
showSaveDialog: async (defaultName) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  return result.canceled ? null : (result.filePath ?? null);
},
showJsonOpenDialog: async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}
```

### 5. Renderer

- `index.html`: thêm nút `btn-import-profiles` ("Nhập") và `btn-export-profiles` ("Xuất") cạnh nút "Thêm Profile".
- `app.ts`:
  - `onExportProfiles()`: gọi `api.exportProfiles()`; `cancelled` + `EXPORT_EMPTY` → `setStatus('Chưa có profile nào để xuất.', 'info')`; `cancelled` khác → im lặng; thành công → `setStatus(\`Đã xuất ${count} profile tới ${path}.\`, 'info')`; lỗi → `setStatus(..., 'error')`.
  - `onImportProfiles()`: gọi `api.importProfiles()`; hủy → im lặng; thành công → dựng thông điệp "Đã thêm N profile" + số bỏ qua/không hợp lệ + cảnh báo, `setStatus(..., 'info' | 'error')`; nếu `addedCount > 0` → `void reloadProfiles()`.
  - Disable nút trong lúc chờ để tránh gọi trùng.

## Re-check Constitution Check sau Phase 1

Thiết kế giữ nguyên các gate: tái dùng tối đa service/tiện ích sẵn có, không dependency mới, không abstraction thừa (chỉ một module thuần phục vụ test), hai handler mới tuân thủ đúng mô hình an toàn IPC, nhập không phá dữ liệu, có kế hoạch test + kiểm chứng, tài liệu tiếng Việt. **ĐẠT** — không cần bảng Complexity Tracking.

## Phase 0 output

`research.md` — các quyết định: JSON thuần vs nén; I/O ở main; module thuần tách riêng; icon nhúng base64 tái dùng `storeIconBuffer`; phát hiện trùng theo ID; áp dụng tuần tự một phần; giới hạn 20 MiB/2 MiB; hai dep dialog mới; đồng bộ shortcut sau khi thêm.

## Phase 1 output

`data-model.md`, `contracts/profile-transfer.contract.md`, `quickstart.md`.
