# Nghiên cứu kỹ thuật: Nhập/Xuất danh sách và cấu hình Profile

**Tính năng**: `009-profile-import-export` | **Ngày**: 2026-09-16

Tài liệu này ghi lại các quyết định kỹ thuật đã chốt cho tính năng, kèm cơ sở và
phương án đã cân nhắc nhưng loại bỏ. Không còn mục `NEEDS CLARIFICATION` nào.

## Q1. Định dạng tệp xuất dùng gì?

**Decision**: JSON thuần với `schemaVersion: 1`, `exportedAt` và mảng `profiles`.

**Rationale**: Phạm vi chỉ là cấu hình nên dữ liệu nhỏ, JSON dễ đọc và dễ kiểm tra
bằng mắt, không cần công cụ giải nén, và không thêm dependency. Trường
`schemaVersion` cho phép tiến hóa định dạng sau này mà vẫn phát hiện tệp cũ.

**Alternatives considered**:
- ZIP/tar.gz: thừa vì không có tệp nhị phân lớn ngoài icon nhúng; thêm dependency
  hoặc phải tự viết mã nén.
- JSON Lines/streaming: chỉ hữu ích khi tệp rất lớn; danh sách chỉ hàng chục
  profile nên không cần.
- CSV: không biểu diễn được cấu hình lồng nhau (XPath, desktop).

## Q2. I/O tệp và hộp thoại đặt ở đâu?

**Decision**: Toàn bộ đọc/ghi tệp và hộp thoại native nằm ở tiến trình **main**,
trong `ManagerService`; renderer sandbox chỉ gọi qua `window.zaloview`.

**Rationale**: Renderer chạy `sandbox: true`, `nodeIntegration: false`,
`contextIsolation: true`, CSP chỉ cho asset local — không thể tự đọc/ghi tệp. Giữ
I/O ở main cũng cho phép kiểm tra sender/frame/URL và giới hạn kích thước trước
khi chạm đĩa.

**Alternatives considered**:
- Ghi tệp trong renderer qua thẻ `<a download>` / `showSaveFilePicker`: không kiểm
  soát đường dẫn, không hợp với mô hình sandbox và khó báo cáo lỗi nhất quán.
- Mở rộng bridge thành generic invoke: vi phạm nguyên tắc bridge hẹp từng API.

## Q3. Logic chuyển đổi đặt ở đâu?

**Decision**: Module thuần mới `src/main/profile-transfer.ts` chứa
`buildExportBundle` và `parseImportBundle`; không import Electron, không chạm FS.

**Rationale**: `manager-handlers.ts` đã ~950 dòng; tách phần thuần giúp unit test
không cần Electron lẫn thư mục tạm, và giữ định dạng tệp tập trung một chỗ.
Truyền hàm `iconReader` từ ngoài vào để module vẫn thuần.

**Alternatives considered**:
- Nhúng thẳng vào `manager-handlers.ts`: ít file nhưng khó test và làm file phình
  thêm.
- Tạo package/thư viện riêng: quá nặng cho hai hàm.

## Q4. Icon xử lý thế nào?

**Decision**: Xuất đọc file icon đã lưu trong vùng `icons` và nhúng base64. Nhập
giải mã base64 rồi lưu lại qua `storeIconBuffer` sẵn có (đã chuẩn hóa PNG,
content-hash, giới hạn 2 MiB và kích thước ảnh). `iconPath` trong tệp bị bỏ qua
hoàn toàn.

**Rationale**: Tái dùng đúng cơ chế đang dùng cho `chooseIcon`/`fetchIcon`, giữ
cùng mức an toàn; icon content-hashed nên thao tác lặp lại là idempotent. Bỏ qua
`iconPath` từ tệp loại bỏ rủi ro trỏ tới đường dẫn tùy ý do người khác soạn tệp.

**Alternatives considered**:
- Chỉ lưu đường dẫn icon: sang máy khác sẽ mất icon, không đạt SC-004.
- Tin `iconPath` trong tệp và copy file từ đường dẫn đó: rủi ro đọc tệp ngoài ý
  muốn (path traversal).

## Q5. Phát hiện trùng lặp theo tiêu chí nào?

**Decision**: Theo `id` của profile (đã có trong registry).

**Rationale**: `id` là định danh bất biến, duy nhất; người dùng đã chốt "bỏ qua
profile trùng". Tên/URL có thể trùng hợp lệ giữa các profile khác nhau.

**Alternatives considered**: Trùng theo tên hoặc URL — dễ bỏ sót profile hợp lệ;
gộp theo cặp tên+URL — vẫn mơ hồ khi người dùng cố ý tạo hai profile cùng URL.

## Q6. Áp dụng nhập theo kiểu toàn bộ hay từng phần?

**Decision**: Validate cấu trúc tệp toàn bộ trước (từ chối nếu sai), sau đó áp
dụng **tuần tự từng profile**: mục hợp lệ được thêm, mục trùng/lỗi bị bỏ qua và
ghi vào báo cáo.

**Rationale**: Đúng lựa chọn nghiệp vụ "nhập phần hợp lệ, báo cáo phần lỗi". Lỗi
cấu trúc tệp là lỗi nghiêm trọng nên từ chối sớm; lỗi từng profile là cục bộ nên
không nên chặn các profile khác.

**Alternatives considered**: All-or-nothing — an toàn nhưng cứng nhắc, một mục
hỏng làm mất toàn bộ thao tác.

## Q7. Giới hạn kích thước?

**Decision**: Tệp nhập ≤ **20 MiB** (kiểm tra `statSync` trước khi đọc nội dung);
icon ≤ **2 MiB** và kích thước ảnh ≤ 1024×1024 theo `ICON_MAX_BYTES`/
`ICON_MAX_DIMENSION` sẵn có.

**Rationale**: 20 MiB đủ chứa hàng chục icon base64 (mỗi icon ≤ 2 MiB) mà vẫn chặn
tệp bất thường trước khi nạp vào bộ nhớ. Dùng lại đúng trần icon hiện hành để
không nới lỏng bảo mật.

**Alternatives considered**: Không giới hạn — rủi ro hết bộ nhớ với tệp lớn; giới
hạn thấp hơn (vài MiB) — có thể chặn nhầm danh sách nhiều icon.

## Q8. Hai dep hộp thoại mới hay mở rộng dep cũ?

**Decision**: Thêm `showSaveDialog` và `showJsonOpenDialog` vào
`ManagerServiceDeps`; giữ nguyên `showOpenDialog` (đang lọc ảnh cho icon).

**Rationale**: `showOpenDialog` hiện tại không nhận tham số và lọc ảnh; mở rộng nó
sẽ phải sửa cả luồng icon và nhiều test hiện có. Dep riêng, rõ nghĩa, dễ giả lập
trong test, và không phá vỡ hành vi cũ.

**Alternatives considered**: Thêm tham số `options` cho `showOpenDialog` — chạm
nhiều test và mơ hồ giữa lọc ảnh và JSON.

## Q9. Có đồng bộ shortcut desktop khi nhập không?

**Decision**: Có. Sau khi `createProfile` thành công, gọi `syncShortcut(profile,
launcherPath)` trong try/catch; lỗi chỉ ghi cảnh báo, không chặn.

**Rationale**: `desktopConfig.createDesktopShortcut` là một phần cấu hình được
nhập; luồng `saveProfile` hiện có cũng đồng bộ shortcut ngay sau khi lưu. Bỏ qua
bước này sẽ khiến cấu hình shortcut không phát huy tác dụng cho tới khi người dùng
tự bật lại.

**Alternatives considered**: Không đồng bộ — đơn giản hơn nhưng cấu hình nhập vào
không hoạt động nhất quán với luồng lưu.

## Q10. Có cần xác nhận trước khi nhập không?

**Decision**: Không. Chỉ hiển thị báo cáo kết quả sau khi nhập.

**Rationale**: Nhập chỉ thêm mới, không ghi đè hay xóa dữ liệu hiện có (trùng ID bị
bỏ qua). Không có thao tác phá hủy nào cần xác nhận.

**Alternatives considered**: Hộp thoại xác nhận — thêm một bước thừa cho thao tác
không phá hủy.

## Q11. Giới hạn danh sách báo cáo hiển thị?

**Decision**: Trả đầy đủ `skipped`/`invalid`/`warnings` trong `ImportReport`;
renderer hiển thị tổng số kèm danh sách (số mục thường nhỏ ở quy mô hàng chục
profile).

**Rationale**: Giữ mô hình đơn giản, đủ thông tin để người dùng xử lý thủ công;
không cần cơ chế phân trang cho quy mô này (YAGNI).

**Alternatives considered**: Chỉ trả số đếm — mất thông tin lý do, khó khắc phục.
