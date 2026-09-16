# Hướng dẫn kiểm chứng: Nhập/Xuất danh sách và cấu hình Profile

**Tính năng**: `009-profile-import-export` | **Ngày**: 2026-09-16

Tài liệu này là hướng dẫn chạy và kiểm chứng đầu cuối. Không chứa mã triển khai;
chi tiết dữ liệu xem `data-model.md`, hợp đồng xem
`contracts/profile-transfer.contract.md`.

## 1. Chuẩn bị

```bash
npm install          # nếu chưa cài
npm run build        # biên dịch main/preload/renderer
```

Môi trường kiểm chứng:

- Linux desktop có hộp thoại native (KDE/GNOME, X11 hoặc Wayland).
- Dùng một `XDG_DATA_HOME`/`XDG_CONFIG_HOME` tạm để không đụng dữ liệu thật:

```bash
export XDG_DATA_HOME=/tmp/zv-data
export XDG_CONFIG_HOME=/tmp/zv-config
```

## 2. Kiểm chứng tự động

```bash
npm run typecheck
npm test
```

**Kỳ vọng**: cả hai lệnh sạch. Test trọng tâm:

- `tests/profile-transfer.test.ts`: build/parse payload thuần (happy path, sai
  `schemaVersion`, JSON hỏng, profile lỗi, icon hỏng, id trùng).
- `tests/manager.test.ts`: `exportProfiles`/`importProfiles` với dep dialog giả và
  thư mục tạm.

## 3. Kịch bản thủ công trên Manager

```bash
./bin/zaloview.js --manager
```

### KB-1 — Xuất danh sách (US1)

1. Tạo 2–3 profile, trong đó ít nhất một profile có icon ("Chọn file…" hoặc "Tải
   từ website").
2. Bấm **Xuất**, chọn nơi lưu.
3. Mở tệp bằng trình soạn thảo.

**Kỳ vọng**: tệp JSON có `schemaVersion: 1`, `exportedAt`, mảng `profiles` đúng số
lượng; mỗi profile có `id`, `name`, `url`, `xpathConfig`, `desktopConfig`; profile
có icon có trường `icon.data` base64. Không thấy `createdAt`, `updatedAt`,
`iconPath`, hay bất kỳ dữ liệu phiên.

### KB-2 — Hủy hộp thoại xuất

1. Bấm **Xuất**, bấm **Hủy** trong hộp thoại lưu.

**Kỳ vọng**: không tệp nào được tạo; danh sách profile không đổi.

### KB-3 — Xuất khi danh sách trống

1. Xóa hết profile (xóa profile không xóa phiên; dùng registry trống ở
   `XDG_CONFIG_HOME` mới để đơn giản).
2. Bấm **Xuất**.

**Kỳ vọng**: thanh trạng thái báo chưa có profile để xuất; không mở hộp thoại lưu
và không ghi tệp.

### KB-4 — Nhập vào registry trống (US2, SC-001, SC-004)

1. Đặt `XDG_CONFIG_HOME` sang thư mục trống mới, khởi động lại Manager.
2. Bấm **Nhập**, chọn tệp đã xuất ở KB-1.

**Kỳ vọng**: các profile xuất hiện đầy đủ tên/URL/cấu hình; profile có icon hiển
thị đúng icon (không rơi về icon mặc định); báo cáo "đã thêm N".

### KB-5 — Bỏ qua profile trùng ID

1. Với registry đang có profile từ KB-4, **Nhập** lại chính tệp đó.

**Kỳ vọng**: không thêm profile nào; báo cáo nêu từng ID bị bỏ qua với lý do trùng.
Dữ liệu hiện có không đổi.

### KB-6 — Nhập phần hợp lệ, báo cáo phần lỗi

1. Sửa tệp JSON: thêm một mục thiếu `name` và một mục có `url` là `ftp://x`.
2. **Nhập** tệp đã sửa.

**Kỳ vọng**: các mục hợp lệ được thêm; hai mục lỗi không được thêm và xuất hiện
trong báo cáo kèm vị trí/lý do.

### KB-7 — Từ chối tệp sai cấu trúc (SC-003)

1. Lần lượt thử: tệp không phải JSON, tệp có `schemaVersion: 2`, tệp có
   `profiles` là object.

**Kỳ vọng**: mỗi lần đều báo lỗi rõ ràng và **không** thay đổi danh sách profile
(so sánh trước/sau).

### KB-8 — Icon hỏng không chặn nhập

1. Sửa một mục trong tệp: thay `icon.data` bằng chuỗi base64 vô nghĩa.
2. **Nhập**.

**Kỳ vọng**: profile vẫn được thêm, hiển thị icon mặc định, và báo cáo có cảnh báo
icon cho profile đó.

### KB-9 — Giới hạn kích thước tệp

1. Tạo tệp > 20 MiB (ví dụ thêm chuỗi đệm vào một mục).
2. **Nhập**.

**Kỳ vọng**: từ chối với thông báo giới hạn; registry không đổi.

### KB-10 — Hủy hộp thoại nhập

1. Bấm **Nhập**, bấm **Hủy**.

**Kỳ vọng**: danh sách profile không đổi, không có thông báo lỗi.

### KB-11 — Shortcut desktop sau khi nhập

1. Xuất một profile có `createDesktopShortcut: true`.
2. Nhập vào registry trống (KB-4).

**Kỳ vọng**: shortcut `.desktop` được tạo cho profile mới như khi lưu profile.
Nếu tạo shortcut lỗi, profile vẫn tồn tại và báo cáo có cảnh báo shortcut.

## 4. Bảng đối chiếu yêu cầu

| Yêu cầu | Kịch bản kiểm chứng |
|---|---|
| FR-001…FR-006 (xuất) | KB-1, KB-2, KB-3 |
| FR-007…FR-014 (nhập, báo cáo) | KB-4, KB-5, KB-6, KB-8, KB-10, KB-11 |
| FR-015 (giới hạn) | KB-8, KB-9 |
| FR-016, FR-017 (an toàn) | KB-7 + test tự động `guard`/parse |
| FR-018, FR-019 | Không có dependency mới; test tự động |
| SC-001…SC-005 | KB-4, KB-6, KB-7 + mục 2 |

## 5. Dọn dẹp

```bash
rm -rf /tmp/zv-data /tmp/zv-config
```
