# Hợp đồng: Nhập/Xuất Profile

**Tính năng**: `009-profile-import-export` | **Ngày**: 2026-09-16

Hợp đồng gồm hai phần: (A) định dạng tệp trao đổi giữa các máy, và (B) kênh IPC +
API cầu nối Manager. Chi tiết trường dữ liệu xem `../data-model.md`.

---

## A. Định dạng tệp trao đổi (`.json`)

Tệp do người dùng chọn đường dẫn, có thể mang sang máy khác. Nội dung là
`ExportBundle` (xem `data-model.md` mục 1–3).

### Ví dụ tối thiểu

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-16T09:00:00.000Z",
  "profiles": [
    {
      "id": "zalo-ca-nhan",
      "name": "Zalo Cá nhân",
      "url": "https://chat.zalo.me/",
      "userAgent": "Mozilla/5.0 ...",
      "xpathConfig": {
        "selector": "//div[contains(@class, 'unread')]",
        "mode": "badge_count",
        "pollIntervalMs": 3000
      },
      "desktopConfig": {
        "flashTaskbar": true,
        "showTaskbarBadge": true,
        "minimizeToTray": false,
        "showDesktopNotification": true,
        "createDesktopShortcut": true
      },
      "icon": {
        "mimeType": "image/png",
        "data": "iVBORw0KGgoAAAANSUhEUg..."
      }
    }
  ]
}
```

### Ràng buộc

| Ràng buộc | Giá trị |
|---|---|
| Phiên bản định dạng hỗ trợ | `schemaVersion === 1` |
| Kích thước tệp tối đa | 20 MiB (`MAX_IMPORT_FILE_BYTES`) |
| Kích thước icon tối đa | 2 MiB (`ICON_MAX_BYTES`), ảnh ≤ 1024×1024 |
| Trường bắt buộc mỗi profile | `id`, `name`, `url`, `xpathConfig`, `desktopConfig` |
| Trường bị bỏ qua khi nhập | `iconPath`, mốc thời gian, mọi trường không nhận biết |
| Trường không bao giờ xuất | Dữ liệu phiên, cookies, `createdAt`, `updatedAt`, `iconPath` |

### Tương thích

- Tăng `schemaVersion` khi cấu trúc đổi theo cách không tương thích ngược.
- Bản cũ hơn phải từ chối tệp có `schemaVersion` không hỗ trợ thay vì đoán.
- Thêm trường tùy chọn mới không cần tăng phiên bản; bản cũ bỏ qua trường lạ.

---

## B. Kênh IPC và API cầu nối

### B.1 API cầu nối (`window.zaloview`)

Thêm vào `ManagerBridgeApi` trong `src/preload/manager-preload.ts`:

```ts
exportProfiles(): Promise<ExportResult>;
importProfiles(): Promise<ImportReport>;
```

### B.2 Kênh IPC

| Kênh | Hướng | Tham số | Trả về | Lỗi |
|---|---|---|---|---|
| `zaloview:export-profiles` | renderer → main | không | `ExportResult` | `EXPORT_EMPTY`, `EXPORT_WRITE_FAILED`, `REGISTRY_CORRUPT` |
| `zaloview:import-profiles` | renderer → main | không | `ImportReport` | `IMPORT_FILE_TOO_LARGE`, `IMPORT_INVALID_FILE`, `VALIDATION_ERROR` |

**Quy tắc chung**:
- Mọi listener gọi `guard(event)` (kiểm tra sender là `mainFrame` của cửa sổ
  Manager và URL trang Manager local) trước khi gọi service — giống 11 kênh hiện
  có. Từ chối → `ManagerError('VALIDATION_ERROR', ...)`.
- Không kênh nào nhận đường dẫn tệp từ renderer; đường dẫn do hộp thoại native ở
  main trả về. Đây là ràng buộc bảo mật bắt buộc.
- Payload phản hồi đúng kiểu trong `data-model.md`; renderer không nhận đối tượng
  lạ.

### B.3 `ExportResult`

```ts
type ExportResult =
  | { cancelled: true; reason: 'CANCELLED' | 'EMPTY' }
  | { cancelled: false; count: number; path: string };
```

### B.4 `ImportReport`

```ts
interface ImportReport {
  cancelled: boolean;
  addedCount: number;
  added: { id: string; name: string }[];
  skipped: { id: string; reason: 'ID_EXISTS' | 'SESSION_DATA_EXISTS' }[];
  invalid: { index: number; reason: string }[];
  warnings: { id?: string; reason: 'ICON_IGNORED' | 'SHORTCUT_FAILED' }[];
}
```

Khi `cancelled: true`, các mảng rỗng và `addedCount = 0`.

### B.5 Ánh xạ lỗi → mã

| Tình huống | Mã `ManagerError` | Thay đổi registry |
|---|---|---|
| Danh sách trống khi xuất | `EXPORT_EMPTY` (qua `ExportResult.reason`) | Không |
| Không ghi được tệp xuất | `EXPORT_WRITE_FAILED` | Không |
| Tệp nhập > 20 MiB | `IMPORT_FILE_TOO_LARGE` | Không |
| JSON hỏng / `schemaVersion` sai / `profiles` không phải mảng | `IMPORT_INVALID_FILE` | Không |
| Yêu cầu không từ cửa sổ Manager local | `VALIDATION_ERROR` | Không |
| Profile lỗi/trùng trong tệp | (không ném) ghi vào `invalid`/`skipped` | Chỉ thêm phần hợp lệ |

---

## C. Tiêu chí chấp nhận hợp đồng

1. Tệp xuất từ máy A nhập trên máy B tạo đủ profile với cấu hình và icon giống
   hệt (trừ mốc thời gian mới).
2. Tệp sai `schemaVersion` bị từ chối, registry giữ nguyên trước/sau.
3. Kênh IPC từ nguồn không tin cậy bị từ chối bởi `guard` trước khi chạm service.
4. Mọi lỗi trả về đều dùng mã trong bảng B.5, không rò rỉ stack hay đường dẫn hệ
   thống ngoài thông báo thân thiện.
