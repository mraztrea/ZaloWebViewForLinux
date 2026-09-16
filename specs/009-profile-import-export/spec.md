# Đặc tả tính năng: Nhập/Xuất danh sách và cấu hình Profile

**Nhánh tính năng**: `009-profile-import-export`

**Ngày tạo**: 2026-09-16

**Trạng thái**: Nháp

**Đầu vào**: Yêu cầu người dùng: "Thêm tính năng import/export danh sách các profile + cấu hình của các profile. Khi import vào sẽ có đầy đủ thông tin dữ liệu profile."

**Nguồn nghiệp vụ**: `specs/007-phase5-manager/spec.md` (Manager Dashboard),
`specs/007-phase5-manager/data-model.md` (mô hình `Profile`, `XPathConfig`,
`DesktopIntegrationConfig`), `src/main/profile-validator.ts` (quy tắc kiểm tra
profile), `src/main/icon-fetcher.ts` (giới hạn kích thước/độ phân giải icon).

## Bối cảnh

Manager hiện lưu danh sách profile tập trung trong `profiles.json` và mỗi profile
có cấu hình riêng (tên, URL, theo dõi XPath, tích hợp desktop, icon). Người dùng
muốn sao lưu danh sách này ra một tệp, rồi khôi phục lại — kể cả trên máy khác.

Phạm vi dữ liệu đã được chốt với người dùng: **chỉ cấu hình profile**, không bao
gồm dữ liệu phiên đăng nhập (cookies, localStorage, IndexedDB…). Vì vậy tệp xuất
là JSON gọn, an toàn, không chứa token/phiên; sau khi nhập người dùng đăng nhập
lại website trong các profile đã khôi phục. Icon được nhúng base64 để profile
sang máy khác vẫn có đủ biểu tượng.

Người dùng đã chốt các lựa chọn nghiệp vụ:

- Xuất **toàn bộ** danh sách profile thành **một** tệp.
- Import gặp profile trùng ID thì **bỏ qua** profile đó.
- Tệp import có profile lỗi thì **nhập phần hợp lệ** và báo cáo phần bị bỏ qua.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Xuất toàn bộ danh sách profile (Priority: P1)

Người dùng bấm nút "Xuất" trong Manager, chọn nơi lưu, và nhận được một tệp JSON
chứa toàn bộ profile cùng cấu hình để sao lưu hoặc mang sang máy khác.

**Why this priority**: Không có tệp xuất thì không có gì để nhập; đây là nửa
đầu tiên và độc lập của tính năng.

**Independent Test**: Tạo vài profile, bấm "Xuất", chọn đường lưu, xác nhận tệp
JSON sinh ra chứa đúng số profile cùng các trường cấu hình.

**Acceptance Scenarios**:

1. **Given** Manager có 3 profile, **When** người dùng bấm "Xuất" và chọn đường
   lưu, **Then** sinh một tệp JSON chứa đúng 3 profile kèm tên, URL, User-Agent,
   cấu hình XPath, cấu hình desktop và icon (nếu có).
2. **Given** người dùng bấm "Xuất" rồi hủy hộp thoại lưu, **When** thao tác kết
   thúc, **Then** không tệp nào được ghi và danh sách profile không đổi.
3. **Given** danh sách profile đang trống, **When** người dùng bấm "Xuất",
   **Then** hệ thống báo không có profile để xuất và không ghi tệp.
4. **Given** một profile có icon trong vùng icons của ứng dụng, **When** xuất,
   **Then** icon được nhúng vào tệp dưới dạng dữ liệu base64.
5. **Given** một profile có icon nhưng tệp icon đã mất trên đĩa, **When** xuất,
   **Then** profile vẫn được xuất và chỉ thiếu phần icon, không chặn thao tác.

---

### User Story 2 - Nhập danh sách profile từ tệp (Priority: P1)

Người dùng bấm nút "Nhập", chọn tệp JSON đã xuất, và Manager tạo lại các profile
hợp lệ, bỏ qua profile trùng ID, đồng thời báo cáo rõ kết quả.

**Why this priority**: Là nửa còn lại của tính năng; chỉ khi nhập được thì giá
trị sao lưu/khôi phục mới hoàn thành.

**Independent Test**: Chuẩn bị sẵn một tệp JSON hợp lệ, bấm "Nhập", chọn tệp, xác
nhận các profile mới xuất hiện trong danh sách và báo cáo khớp số lượng.

**Acceptance Scenarios**:

1. **Given** tệp JSON hợp lệ chứa 2 profile chưa tồn tại, **When** người dùng
   "Nhập" và chọn tệp, **Then** cả 2 profile được thêm vào danh sách với đầy đủ
   tên, URL, User-Agent, cấu hình XPath và cấu hình desktop; báo cáo "đã thêm 2".
2. **Given** tệp chứa 1 profile có ID đã tồn tại trong Manager, **When** nhập,
   **Then** profile đó bị bỏ qua, các profile còn lại vẫn được thêm, và báo cáo
   nêu rõ ID bị bỏ qua kèm lý do trùng.
3. **Given** tệp chứa 3 profile trong đó 1 profile thiếu tên hoặc URL không hợp
   lệ, **When** nhập, **Then** 2 profile hợp lệ được thêm, profile lỗi không được
   thêm và được liệt kê trong báo cáo kèm lý do.
4. **Given** người dùng bấm "Nhập" rồi hủy hộp thoại chọn tệp, **When** thao tác
   kết thúc, **Then** danh sách profile không đổi.
5. **Given** tệp không phải JSON hợp lệ hoặc thiếu `schemaVersion` không được hỗ
   trợ, **When** nhập, **Then** hệ thống từ chối tệp, báo lỗi rõ ràng và không
   thay đổi bất kỳ profile nào.
6. **Given** tệp chứa icon nhúng hợp lệ, **When** nhập trên máy khác, **Then**
   profile được tạo có icon hiển thị đúng thay vì icon mặc định.
7. **Given** tệp chứa icon nhúng hỏng hoặc vượt giới hạn kích thước, **When**
   nhập, **Then** profile vẫn được thêm nhưng không có icon, kèm cảnh báo trong
   báo cáo.

---

### User Story 3 - Báo cáo kết quả nhập minh bạch (Priority: P2)

Sau khi nhập, người dùng thấy ngay số profile đã thêm, số bị bỏ qua và lý do, để
biết dữ liệu nào cần xử lý thủ công.

**Why this priority**: Bổ trợ quan trọng cho US2 nhưng không chặn giá trị cốt lõi;
có thể bổ sung sau khi luồng thêm profile đã hoạt động.

**Independent Test**: Nhập một tệp cố tình trộn profile hợp lệ, trùng và lỗi, xác
nhận báo cáo liệt kê đúng từng nhóm và lý do.

**Acceptance Scenarios**:

1. **Given** một lần nhập có cả profile thêm mới, trùng và lỗi, **When** hoàn
   tất, **Then** Manager hiển thị tổng số thêm mới và danh sách các mục bị bỏ
   qua kèm lý do.
2. **Given** một lần nhập có profile được thêm nhưng đồng bộ shortcut desktop
   thất bại, **When** hoàn tất, **Then** profile vẫn tồn tại và báo cáo nêu cảnh
   báo shortcut cho profile đó.

---

### Edge Cases

- **Tệp JSON sai cú pháp** (không parse được): từ chối, không thay đổi registry.
- **`schemaVersion` khác phiên bản hỗ trợ**: từ chối kèm thông báo phiên bản.
- **`profiles` không phải mảng** hoặc là mảng rỗng: từ chối (không phải mảng) hoặc
  báo "không có profile nào để nhập" (mảng rỗng), registry không đổi.
- **Tệp vượt giới hạn kích thước cho phép**: từ chối trước khi nạp toàn bộ vào bộ
  nhớ, kèm thông báo giới hạn.
- **ID trùng với thư mục dữ liệu phiên còn sót** (phiên mồ côi không còn trong
  registry): profile đó bị bỏ qua kèm lý do, không xóa phiên của người dùng.
- **Cấu hình XPath sai**: mode lạ, chu kỳ quét ngoài khoảng, selector quá dài →
  profile bị coi là không hợp lệ.
- **`desktopConfig` sai kiểu**: trường không phải boolean → profile không hợp lệ.
- **Trường lạ trong tệp**: bỏ qua, chỉ đọc các trường đã biết.
- **Icon base64 không giải mã được / vượt 2 MiB / vượt kích thước cho phép**: bỏ
  icon, vẫn thêm profile, ghi cảnh báo.
- **Ghi tệp xuất thất bại** (thiếu quyền, hết dung lượng): báo lỗi, không thay
  đổi danh sách profile.
- **Nhiều profile cùng tên hoặc cùng URL nhưng khác ID**: vẫn thêm bình thường,
  không coi là lỗi.
- **Registry hiện tại bị hỏng**: không thể xuất, báo lỗi đọc danh sách.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Manager MUST có nút "Xuất" và nút "Nhập" cho danh sách profile.
- **FR-002**: Thao tác xuất MUST ghi một tệp JSON gồm `schemaVersion`,
  `exportedAt` và mảng `profiles`.
- **FR-003**: Mỗi profile trong tệp xuất MUST chứa `id`, `name`, `url`,
  `userAgent` (nếu có), `xpathConfig`, `desktopConfig` và `icon` (nếu có, dạng
  `mimeType` + dữ liệu base64).
- **FR-004**: Tệp xuất MUST NOT chứa dữ liệu phiên đăng nhập, cookies, cache hay
  bất kỳ nội dung website nào; MUST NOT chứa `createdAt`, `updatedAt` và đường dẫn
  icon gốc (`iconPath`).
- **FR-005**: Thao tác xuất MUST hỏi người dùng nơi lưu với tên gợi ý; nếu người
  dùng hủy thì không ghi tệp và không thay đổi dữ liệu.
- **FR-006**: Khi xuất, hệ thống MUST đọc icon từ vùng icons của ứng dụng và nhúng
  base64; nếu không đọc được icon thì bỏ qua icon đó, không chặn việc xuất.
- **FR-007**: Thao tác nhập MUST hỏi người dùng chọn một tệp JSON; nếu người dùng
  hủy thì không thay đổi dữ liệu.
- **FR-008**: Hệ thống MUST kiểm tra cấu trúc tệp nhập (`schemaVersion` được hỗ
  trợ, `profiles` là mảng); nếu không đạt thì từ chối toàn bộ tệp và không thay
  đổi registry.
- **FR-009**: Hệ thống MUST kiểm tra từng profile trong tệp bằng đúng các quy tắc
  hợp lệ hiện hành của profile (ID slug, tên, URL HTTP/HTTPS không nhúng
  credentials, cấu hình XPath, cấu hình desktop).
- **FR-010**: Profile có ID đã tồn tại trong registry MUST bị bỏ qua, không ghi
  đè; các profile khác MUST tiếp tục được xử lý.
- **FR-011**: Profile hợp lệ MUST được tạo với mốc thời gian mới, giữ nguyên
  `id`, `name`, `url`, `userAgent`, `xpathConfig`, `desktopConfig` từ tệp.
- **FR-012**: Icon nhúng hợp lệ MUST được lưu vào vùng icons của ứng dụng và gán
  làm `iconPath` của profile mới; icon lỗi MUST bị bỏ qua mà vẫn thêm profile,
  kèm cảnh báo trong báo cáo.
- **FR-013**: Sau khi thêm profile hợp lệ, hệ thống MUST đồng bộ shortcut desktop
  theo `desktopConfig` như luồng lưu profile hiện có; lỗi đồng bộ shortcut MUST
  NOT chặn việc nhập, chỉ ghi cảnh báo.
- **FR-014**: Kết thúc nhập, hệ thống MUST trả báo cáo gồm: số profile đã thêm,
  danh sách profile bị bỏ qua (ID + lý do), danh sách mục không hợp lệ (vị trí
  trong tệp + lý do) và danh sách cảnh báo icon/shortcut.
- **FR-015**: Hệ thống MUST từ chối tệp nhập vượt **20 MiB** kèm thông báo giới
  hạn; giới hạn icon tuân theo quy tắc hiện hành (≤ 2 MiB và kích thước ảnh hợp
  lệ).
- **FR-016**: Việc đọc/ghi tệp và hộp thoại hệ thống MUST diễn ra ở tiến trình
  main; renderer sandbox chỉ giao tiếp qua cầu nối Manager hiện có và MUST NOT
  nhận đường dẫn ghi tùy ý từ nội dung tệp.
- **FR-017**: Hệ thống MUST NOT tin dữ liệu đường dẫn trong tệp: `iconPath` từ
  tệp bị bỏ qua hoàn toàn; `id` phải qua kiểm tra slug chống duyệt thư mục.
- **FR-018**: Thao tác nhập MUST NOT coi trường lạ là lỗi (bỏ qua), MUST NOT khởi
  chạy runner và MUST NOT thay đổi dữ liệu phiên của bất kỳ profile nào.
- **FR-019**: Tính năng MUST NOT thêm dependency npm mới.

### Key Entities

- **Tệp xuất (Export Bundle)**: `schemaVersion` (phiên bản định dạng), `exportedAt`
  (thời điểm xuất), `profiles` (danh sách profile đã xuất).
- **Profile đã xuất**: `id`, `name`, `url`, `userAgent`, `xpathConfig`,
  `desktopConfig`, `icon` (mimeType + base64, tùy chọn). Không chứa mốc thời gian
  hay đường dẫn icon gốc.
- **Báo cáo nhập (Import Report)**: `addedCount`, `skipped` (ID + lý do),
  `invalid` (vị trí + lý do), `warnings` (icon/shortcut).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Xuất N profile rồi nhập tệp đó vào một registry trống tạo lại đủ N
  profile với tên, URL, User-Agent, cấu hình XPath và cấu hình desktop giống hệt.
- **SC-002**: Với một tệp trộn profile hợp lệ, trùng và lỗi, số profile được thêm
  đúng bằng số hợp lệ chưa tồn tại; báo cáo liệt kê đúng từng mục bị bỏ qua.
- **SC-003**: Nhập tệp sai `schemaVersion` hoặc JSON hỏng không làm thay đổi bất
  kỳ profile nào (registry giữ nguyên trước/sau).
- **SC-004**: Profile xuất kèm icon rồi nhập trên máy khác hiển thị đúng icon
  (không rơi về icon mặc định) trong 100% trường hợp icon nguồn hợp lệ.
- **SC-005**: `npm run typecheck` và `npm test` đều sạch sau thay đổi.

## Assumptions

- Người dùng chỉ muốn sao lưu cấu hình; dữ liệu phiên đăng nhập nằm ngoài phạm vi
  và người dùng sẽ đăng nhập lại sau khi nhập.
- Định dạng tệp là JSON với `schemaVersion` bắt đầu từ 1; tương thích tiến hóa
  bằng cách tăng phiên bản khi cấu trúc đổi.
- Xuất lấy toàn bộ danh sách, không hỗ trợ chọn lọc từng profile ở phiên bản này.
- Trùng lặp được xác định theo ID profile, không theo tên hay URL.
- Giới hạn kích thước tệp nhập là **20 MiB**; icon tuân theo giới hạn hiện hành
  của ứng dụng (≤ 2 MiB).
- Shortcut desktop của profile nhập được đồng bộ như luồng lưu profile để cấu
  hình `createDesktopShortcut` phát huy tác dụng ngay.
- Không cần xác nhận trước khi nhập vì thao tác chỉ thêm mới, không ghi đè hay
  xóa dữ liệu hiện có.
- Chỉ hỗ trợ giao diện Manager Dashboard hiện tại; không thêm giao diện dòng lệnh
  cho tính năng này.
