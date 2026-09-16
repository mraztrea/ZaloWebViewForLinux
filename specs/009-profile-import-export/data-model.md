# Mô hình dữ liệu: Nhập/Xuất danh sách và cấu hình Profile

**Tính năng**: `009-profile-import-export` | **Ngày**: 2026-09-16

Tài liệu mô tả các thực thể dữ liệu của tính năng: định dạng tệp xuất, kết quả
xuất, báo cáo nhập, và các kiểu trung gian dùng khi parse. Các kiểu cấu hình
`XPathConfig`, `DesktopIntegrationConfig` kế thừa từ `src/shared/types.ts`.

## 1. ExportBundle — nội dung tệp xuất

Đối tượng JSON gốc của tệp xuất.

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `schemaVersion` | `number` | Có | Phiên bản định dạng; hiện tại là `1` |
| `exportedAt` | `string` (ISO 8601) | Có | Thời điểm xuất tệp |
| `profiles` | `ExportedProfile[]` | Có | Danh sách profile đã xuất (có thể rỗng) |

**Quy tắc**:
- `schemaVersion` khác `1` khi nhập → từ chối toàn bộ tệp.
- `profiles` không phải mảng → từ chối toàn bộ tệp.
- `profiles` là mảng rỗng → nhập thành công với `addedCount = 0`, báo "không có
  profile nào để nhập".

## 2. ExportedProfile — một profile trong tệp xuất

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `id` | `string` | Có | Định danh slug, dùng để phát hiện trùng |
| `name` | `string` | Có | Tên hiển thị |
| `url` | `string` | Có | Địa chỉ HTTP/HTTPS |
| `userAgent` | `string` | Không | User-Agent (bỏ trường nếu rỗng) |
| `xpathConfig` | `XPathConfig` | Có | `{ selector, mode, pollIntervalMs }` |
| `desktopConfig` | `DesktopIntegrationConfig` | Có | 5 cờ boolean tích hợp desktop |
| `icon` | `ExportedIcon` | Không | Chỉ có khi profile có icon đọc được lúc xuất |

**Không có trong tệp**: `createdAt`, `updatedAt`, `iconPath`.

**Quy tắc nhập**: `id` phải qua `validateProfileId` (slug, ≤ 64 ký tự, không chứa
`/`, `\`, `..`). Các trường còn lại qua `validateProfile`. Trường lạ bị bỏ qua.
`iconPath` trong tệp (nếu có) bị bỏ qua hoàn toàn.

## 3. ExportedIcon — icon nhúng

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `mimeType` | `string` | Có | Loại ảnh, ví dụ `image/png` |
| `data` | `string` | Có | Nội dung ảnh mã hóa base64 |

**Quy tắc**: Chỉ nhận khi `mimeType` và `data` đều là chuỗi phi rỗng. Khi nhập,
giải mã base64; nếu vượt `ICON_MAX_BYTES` (2 MiB) hoặc `storeIconBuffer` trả về
`fallback` thì bỏ icon, thêm profile bình thường và ghi cảnh báo.

## 4. ExportResult — kết quả thao tác xuất

| Trường | Kiểu | Mô tả |
|---|---|---|
| `cancelled` | `boolean` | `true` khi người dùng hủy hoặc không có gì để xuất |
| `reason` | `'CANCELLED' \| 'EMPTY'` | Chỉ có khi `cancelled = true`; `EMPTY` khi danh sách trống |
| `count` | `number` | Số profile đã ghi (khi thành công) |
| `path` | `string` | Đường dẫn tệp đã ghi (khi thành công) |

## 5. ImportReport — báo cáo sau khi nhập

| Trường | Kiểu | Mô tả |
|---|---|---|
| `cancelled` | `boolean` | `true` khi người dùng hủy chọn tệp |
| `addedCount` | `number` | Số profile đã thêm thành công |
| `added` | `{ id: string; name: string }[]` | Danh sách profile đã thêm |
| `skipped` | `{ id: string; reason: SkipReason }[]` | Profile bị bỏ qua |
| `invalid` | `{ index: number; reason: string }[]` | Mục không hợp lệ (kèm vị trí trong mảng `profiles`) |
| `warnings` | `{ id?: string; reason: WarnReason }[]` | Cảnh báo icon/shortcut |

**SkipReason**: `ID_EXISTS` (ID đã có trong registry), `SESSION_DATA_EXISTS` (thư
mục dữ liệu phiên còn sót trên đĩa).

**WarnReason**: `ICON_IGNORED` (icon không giải mã được/sai kích thước, profile
vẫn được thêm không icon), `SHORTCUT_FAILED` (đồng bộ shortcut desktop thất bại).

## 6. ParsedProfileEntry — kiểu trung gian khi parse

Kết quả `parseImportBundle` trả về các mục đã qua kiểm tra, sẵn sàng để tạo
profile. Gồm các trường của `ExportedProfile` (không có `icon`), thay bằng
`iconBase64?: string`.

## 7. Sơ đồ chuyển đổi

```text
Profile[] (registry)
   │ buildExportBundle(profiles, iconReader)
   ▼
ExportBundle ──atomicWriteFile──▶ tệp .json của người dùng

tệp .json của người dùng
   │ parseImportBundle(text)
   ▼
ParseImportResult { entries, invalid }
   │ với mỗi entry: kiểm tra trùng ID → storeIconBuffer → createProfile
   ▼
ImportReport { addedCount, added, skipped, invalid, warnings }
```

## 8. Ánh xạ sang thực thể hiện có

| Dữ liệu tính năng | Nguồn/đích hiện có |
|---|---|
| `Profile` | `src/shared/types.ts` (nguyên trạng) |
| `XPathConfig`, `DesktopIntegrationConfig` | `src/shared/types.ts` |
| Kiểm tra hợp lệ | `src/main/profile-validator.ts` (`validateProfile`, `validateProfileId`) |
| Ghi profile | `ProfileManager.createProfile` |
| Icon | `ManagerService.storeIconBuffer` + `ICON_MAX_BYTES`/`ICON_MAX_DIMENSION` |
| Ghi tệp xuất | `atomicWriteFile` |
| Shortcut | `syncProfileShortcut` (dep `syncShortcut`) |
| Vùng icon | `resolveDataDir()/icons` |

## 9. Không nằm trong mô hình dữ liệu

- Dữ liệu phiên đăng nhập (cookies, localStorage, IndexedDB, cache).
- `window-state.json` và `permissions.json` của profile.
- `createdAt`/`updatedAt`: khi nhập, profile được tạo với mốc thời gian mới.
