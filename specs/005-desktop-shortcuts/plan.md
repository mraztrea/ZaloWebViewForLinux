# Kế hoạch triển khai: Shortcut desktop theo profile

**Nhánh**: `005-desktop-shortcuts` | **Ngày**: 2026-09-13 | **Đặc tả**: [spec.md](spec.md)

**Đầu vào**: Đặc tả tính năng tại `specs/005-desktop-shortcuts/spec.md`

## Tóm tắt

Phase 4 tạo, cập nhật và gỡ một Desktop Entry cấp người dùng cho mỗi profile, mở đúng runner bằng launcher đã cài và giữ kết quả shortcut tách khỏi kết quả lưu profile. Giải pháp thêm một service main nhỏ, tái sử dụng validation, XDG resolver và atomic writer hiện có; launcher sản phẩm là bundle Electron portable tạo từ runtime đã khóa, không thêm dependency đóng gói.

## Bối cảnh kỹ thuật

**Ngôn ngữ/Phiên bản**: TypeScript 5.8 strict mode, JavaScript ESM cho script build, Node.js `>= 22.0.0`

**Phụ thuộc chính**: Electron `>= 44.3.0`, Node.js standard library; không thêm runtime hoặc thư viện desktop mới

**Lưu trữ**: Desktop Entry UTF-8 dưới `$XDG_DATA_HOME/applications` với fallback `~/.local/share/applications`; profile registry và session hiện có không đổi

**Kiểm thử**: Vitest 3, TypeScript typecheck, esbuild build, `desktop-file-validate` khi có, smoke launcher và nghiệm thu KDE/GNOME trên X11/Wayland khả dụng

**Nền tảng đích**: Linux desktop cấp người dùng; KDE Plasma và GNOME, X11 và Wayland

**Loại dự án**: Ứng dụng desktop Electron gồm một Manager và một runner riêng cho mỗi profile

**Mục tiêu hiệu năng**: Đồng bộ một shortcut bằng một lần đọc/so sánh và tối đa một lần ghi nguyên tử; menu tìm thấy shortcut đã cài trong tối đa 30 giây trên môi trường được xác nhận hỗ trợ; 10 lần mở lặp không tạo runner thứ hai

**Ràng buộc**: Không shell interpolation, không quyền quản trị, file shortcut `0644`, registry giữ `0600`, cập nhật lỗi giữ bản cũ, launcher không phụ thuộc cwd/PATH/Node/devDependencies, không tự động pin/unpin, không phụ thuộc `update-desktop-database`

**Quy mô/Phạm vi**: Một shortcut cho mỗi profile hợp lệ; thao tác độc lập theo ID; Phase 4 không nối CRUD GUI hay workflow xóa session của Phase 5

## Kiểm tra nguyên tắc dự án

*GATE: Đạt trước Phase 0 và được kiểm tra lại sau thiết kế Phase 1.*

- **Quy trình spec-driven**: ĐẠT — `spec.md` và checklist 16/16 đã có; lệnh này chỉ tạo artifact Phase 0/1, chưa sửa mã nguồn.
- **Tiếng Việt**: ĐẠT — toàn bộ plan, research, data model, contract và quickstart được viết bằng tiếng Việt; định danh kỹ thuật được giữ nguyên.
- **Tối giản/YAGNI**: ĐẠT — một service mới và một script đóng gói dùng standard library; không thêm framework, factory, DBus wrapper, updater hoặc trình đóng gói bên thứ ba.
- **Tái sử dụng**: ĐẠT — dùng nguyên `validateProfileId`, `resolveDataDir` và `atomicWriteFile`; không thay đổi hành vi helper/type hiện có có blast radius cao.
- **Bảo mật và dữ liệu**: ĐẠT — validate trước filesystem, tách encoding Desktop Entry/Exec, kiểm tra quyền sở hữu trước update/remove và giữ registry/session ngoài side effect shortcut.
- **Kiểm chứng**: ĐẠT — thiết kế yêu cầu test thất bại trước, targeted tests, `npm run typecheck`, `npm test`, `npm run build`, validator và bằng chứng desktop thực.
- **Bảo toàn tài liệu**: ĐẠT — tài liệu hiện có được dùng làm nguồn; thay đổi hướng dẫn cài đặt chỉ bổ sung thông tin Phase 4.
- **GitNexus**: ĐẠT CÓ CẢNH BÁO — impact hiện tại báo `atomicWriteFile`, `resolveDataDir`, `Profile`, `DesktopIntegrationConfig` ở mức CRITICAL và `validateProfileId` ở mức HIGH. Kế hoạch chỉ gọi lại các symbol này, không sửa chúng; trước mọi thay đổi mã nguồn vẫn phải chạy impact cho symbol/file thực tế và không được bỏ qua cảnh báo HIGH/CRITICAL.
- **Kiểm tra lại sau Phase 1**: ĐẠT — data model và hai hợp đồng giữ nguyên ranh giới Phase 4, mọi điểm chưa rõ đã được giải quyết và không tạo vi phạm cần biện minh.

## Cấu trúc dự án

### Tài liệu của tính năng

```text
specs/005-desktop-shortcuts/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── desktop-shortcut.md
│   └── installed-launcher.md
└── tasks.md                  # Được tạo sau bởi speckit-tasks
```

### Mã nguồn tại repository root

```text
src/
├── main/
│   ├── desktop-service.ts    # Tạo/cập nhật/gỡ Desktop Entry; không ghi registry
│   ├── atomic-writer.ts      # Tái sử dụng nguyên trạng với mode 0644
│   ├── profile-validator.ts  # Tái sử dụng validateProfileId/profile
│   ├── xdg-paths.ts          # Tái sử dụng resolveDataDir để suy ra XDG data home
│   └── index.ts              # Giữ identity zaloview-<id> hiện có
└── shared/
    └── types.ts              # Bổ sung ShortcutSyncResult, không đổi type hiện có

scripts/
└── package-linux.mjs         # Tạo bundle Linux portable từ dist và Electron runtime đã khóa

tests/
├── desktop-service.test.ts   # Serialization, validation, lifecycle, quyền và rollback
├── package-linux.test.ts     # Cấu trúc bundle và launcher ngoài môi trường dev
└── fixtures/
    └── zaloview-zalo.desktop # Fixture đối chiếu identity hiện có

docs/
└── installation.md           # Cài, cập nhật, gỡ và giới hạn desktop/backend
```

**Quyết định cấu trúc**: Giữ cấu trúc một ứng dụng hiện có. `desktop-service.ts` là ranh giới duy nhất cho shortcut; `ProfileManager` tiếp tục chỉ quản lý registry. Script đóng gói tách khỏi build thường để `npm run build` không bất ngờ sao chép runtime lớn.

## Thiết kế kỹ thuật

### 1. Launcher đã cài

`npm run package:linux` chạy build rồi sao chép toàn bộ `node_modules/electron/dist` vào bundle theo kiến trúc tại `build/zaloview-linux-<arch>`, đổi binary `electron` thành `zaloview`, và đặt ứng dụng đã build cùng `package.json` tối thiểu dưới `resources/app`. Bundle không cần Node, npm, source hay devDependencies tại runtime.

Người dùng sao chép nguyên bundle tới một đường cấp người dùng ổn định được ghi trong `docs/installation.md`. `launcherPath` luôn là đường tuyệt đối tới binary `zaloview` trong bundle; service không suy từ launcher phát triển hoặc một cwd hiện tại. Cập nhật giữ nguyên đường cài để shortcut cũ không hỏng; gỡ cài đặt gỡ shortcut trước rồi mới xóa bundle.

### 2. Desktop Entry và ownership

Service sinh bộ key cố định: `[Desktop Entry]`, `Version=1.5`, `Type=Application`, `Name`, `Exec`, `Icon`, `Terminal=false`, `Categories=Network;`, `StartupWMClass` và `X-ZaloWebView-ProfileId`. Không sinh URL field code, `%u`, actions, `DBusActivatable` hoặc lệnh sudo.

Identity giữ đúng quyết định dự án: basename `zaloview-<id>.desktop`, `app.setDesktopName('zaloview-<id>')` và `StartupWMClass=zaloview-<id>`. Reverse-DNS là khuyến nghị của chuẩn, không phải điều kiện bắt buộc cho Phase 4; giới hạn portal/D-Bus được ghi để xem xét trước GlobalShortcuts/Flatpak thay vì migration trong feature này.

Marker `X-ZaloWebView-ProfileId` xác nhận ownership trước khi ghi đè hoặc xóa. Symlink, file thiếu marker hoặc marker không khớp trả lỗi và không bị thay đổi.

### 3. Validation và serialization

ID được kiểm tra bằng validator nghiệp vụ trước khi ghép đường dẫn. `launcherPath` phải tuyệt đối, tồn tại, là regular file và executable; icon chỉ dùng đường tuyệt đối tới file do ứng dụng quản lý, nếu thiếu/ngoài phạm vi/không hợp lệ thì dùng theme fallback `applications-internet`.

Desktop Entry string và từng argv trong `Exec` dùng hai bước encode riêng theo chuẩn. Control characters có thể thay đổi cấu trúc bị từ chối; `%` được bảo toàn theo quy tắc field code; không gọi shell. Test giải mã bằng oracle độc lập hoặc công cụ desktop, không dùng chính serializer để tự xác nhận.

### 4. Vòng đời và lỗi từng phần

Luồng trạng thái là absent → `created`; owned/same bytes → `unchanged`; owned/different → `updated`; owned/disable hoặc delete → `removed`; absent/remove → `unchanged`. Unowned collision, symlink hoặc I/O failure không thay file và trả `error` có path/message.

Ghi sử dụng `atomicWriteFile(path, content, 0o644)`; mặc định `0600` của caller registry không đổi. Service không ghi registry và không xóa session/icon gốc. Phase 5 phối hợp `{ profile, shortcut }`; lỗi shortcut sau khi profile đã lưu không rollback registry và retry chỉ gọi đồng bộ shortcut.

### 5. Kiểm chứng

Test tự động bao phủ XDG tùy chỉnh/rỗng/tương đối; Unicode; quote, backslash, dollar, backtick, percent; CR/LF/NUL; traversal; launcher thiếu/không executable; icon fallback; ownership collision; idempotency; mode `0644`; rollback write/rename; registry vẫn `0600`; bundle chạy từ cwd/PATH khác và đường có khoảng trắng.

Nghiệm thu thủ công ghi riêng KDE/GNOME × X11/Wayland. X11 đo `WM_CLASS`; Wayland đo `app_id`; không dùng `StartupWMClass` làm bằng chứng Wayland. Mỗi môi trường ghi validator, menu ≤30 giây, mở đúng profile, 10 lần mở lặp, icon và pin/unpin; môi trường thiếu giữ trạng thái “Chưa kiểm thử”.

## Truy vết yêu cầu

| Yêu cầu | Thiết kế đáp ứng | Bằng chứng dự kiến |
| --- | --- | --- |
| FR-001–FR-007 | Vòng đời idempotent trong desktop service | Test create/unchanged/update/remove và mở lặp |
| FR-008–FR-013 | Validation, hai lớp encoding, ownership marker và atomic write | Test traversal/control/special chars/symlink/mode/rollback |
| FR-014–FR-018 | `ShortcutSyncResult`, service không ghi registry/session, launcher validation | Test lỗi từng phần, retry và bảo toàn dữ liệu |
| FR-019 | Ma trận nghiệm thu theo desktop/backend | Quickstart và bằng chứng môi trường |
| FR-020 | Bộ key/argv cố định và giới hạn phạm vi | Contract không URL/action/pin/sudo |
| SC-001–SC-007 | Test tự động, validator và fault injection | Targeted suite + full suite |
| SC-008–SC-009 | Smoke menu và ma trận KDE/GNOME × X11/Wayland | Báo cáo quan sát thực tế |

## Kết quả phân tích thay đổi GitNexus

Đã làm mới index bằng GitNexus 1.6.11 rồi chạy `detect-changes --scope all --repo .` (sau khi đưa cả file mới vào phạm vi diff). Kết quả đầy đủ của lần chạy: **10 files, 74 symbols, 7 affected processes, risk level high**; lệnh hoàn tất, không báo `partial` hoặc `truncated`. Mức `high` đến từ các flow mới của service gọi resolver/validator/atomic writer hiện có, không phải thay đổi hành vi các helper đó.

Các flow bị ảnh hưởng được GitNexus liệt kê:

- `SyncProfileShortcut → ResolveDataDir` (5 bước)
- `DesktopEntry → RejectControlCharacters` (3 bước)
- `SyncProfileShortcut → ErrorResult` (3 bước)
- `SyncProfileShortcut → OwnedEntry` (3 bước)
- `SyncProfileShortcut → RejectControlCharacters` (3 bước)
- `SyncProfileShortcut → ProfileValidationError` (4 bước)
- `DesktopEntry → ResolveDataDir` (3 bước)

Đã rà soát lại các cảnh báo CRITICAL/HIGH trước đó: chỉ thêm type kết quả và module mới, không sửa `Profile`, `DesktopIntegrationConfig`, `resolveDataDir`, `atomicWriteFile` hoặc validator hiện hữu.
