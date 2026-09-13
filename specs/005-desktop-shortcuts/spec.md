# Đặc tả tính năng: Shortcut desktop theo profile

**Nhánh tính năng**: `005-desktop-shortcuts`

**Ngày tạo**: 2026-09-13

**Trạng thái**: Nháp

**Đầu vào**: Mô tả của người dùng: "Đọc tài liệu trong docs/phases/phase-4-shortcuts và các tài liệu liên quan, thực hiện triển khai Phase 4"

## Kịch bản người dùng và kiểm thử *(bắt buộc)*

### User Story 1 - Mở đúng profile từ menu desktop (Ưu tiên: P1)

Người dùng bật shortcut cho một profile, tìm profile đó trong menu ứng dụng Linux và mở đúng runner mà không cần khởi chạy từ terminal hay biết vị trí cài đặt của ứng dụng.

**Lý do ưu tiên**: Đây là giá trị cốt lõi của Phase 4; shortcut không có ích nếu không thể mở đúng profile từ một phiên desktop thông thường.

**Kiểm thử độc lập**: Cài shortcut cho một profile hợp lệ, tìm theo tên profile trong menu ứng dụng rồi mở từ các thư mục làm việc và môi trường biến đường dẫn khác nhau; runner đúng profile phải xuất hiện.

**Kịch bản chấp nhận**:

1. **Cho trước** một profile hợp lệ đã bật shortcut và ứng dụng đã được cài, **Khi** người dùng chọn shortcut từ menu ứng dụng, **Thì** runner của đúng profile được mở.
2. **Cho trước** runner của profile đang khởi động, thu nhỏ hoặc ẩn, **Khi** người dùng mở lại cùng shortcut, **Thì** cửa sổ hiện có được khôi phục và không có runner trùng lặp.
3. **Cho trước** tên profile có ký tự tiếng Việt và icon hợp lệ, **Khi** shortcut xuất hiện trong menu, **Thì** tên và icon tương ứng được hiển thị đúng.
4. **Cho trước** icon profile không còn khả dụng, **Khi** shortcut được đồng bộ, **Thì** shortcut vẫn dùng được với icon dự phòng an toàn.

---

### User Story 2 - Đồng bộ vòng đời shortcut an toàn (Ưu tiên: P1)

Người dùng có thể bật, cập nhật và tắt shortcut theo cấu hình profile. Khi profile đổi tên hoặc icon, shortcut được cập nhật; khi tắt shortcut hoặc xóa profile, chỉ shortcut do ứng dụng quản lý cho profile đó bị gỡ.

**Lý do ưu tiên**: Shortcut phải phản ánh dữ liệu profile hiện tại và không để lại mục cũ hoặc tác động nhầm dữ liệu khác.

**Kiểm thử độc lập**: Thực hiện chuỗi bật lần đầu, bật lại, đổi tên/icon, tắt và tắt lại; mỗi bước phải cho kết quả ổn định, có thể lặp và không thay đổi shortcut của profile khác.

**Kịch bản chấp nhận**:

1. **Cho trước** profile chưa có shortcut, **Khi** người dùng bật tùy chọn shortcut, **Thì** một shortcut duy nhất được tạo cho profile.
2. **Cho trước** shortcut đã khớp cấu hình hiện tại, **Khi** đồng bộ lại mà không thay đổi profile, **Thì** hệ thống báo không có thay đổi và không tạo bản sao.
3. **Cho trước** profile đã đổi tên hoặc icon, **Khi** shortcut được đồng bộ, **Thì** shortcut hiện có được cập nhật và không để lại mục cũ.
4. **Cho trước** shortcut đang tồn tại, **Khi** người dùng tắt tùy chọn hoặc xóa profile, **Thì** shortcut tương ứng bị gỡ nhưng phiên đăng nhập và shortcut của profile khác được giữ nguyên.
5. **Cho trước** shortcut không tồn tại, **Khi** yêu cầu gỡ được lặp lại, **Thì** thao tác vẫn hoàn tất mà không phát sinh lỗi hoặc xóa mục không liên quan.

---

### User Story 3 - Nhận kết quả rõ ràng khi đồng bộ thất bại (Ưu tiên: P2)

Khi cấu hình profile đã được lưu nhưng shortcut không thể tạo hoặc cập nhật, người dùng nhận được trạng thái riêng cho từng phần và có thể thử đồng bộ lại mà không tạo profile trùng hoặc mất cấu hình vừa lưu.

**Lý do ưu tiên**: Lỗi tích hợp desktop không được làm mất dữ liệu profile hoặc khiến người dùng hiểu nhầm rằng toàn bộ thao tác đã thất bại hay thành công.

**Kiểm thử độc lập**: Mô phỏng môi trường không ghi được shortcut sau khi profile đã lưu; xác nhận dữ liệu profile được giữ nguyên, lỗi nêu đúng phần thất bại và lần thử lại chỉ đồng bộ shortcut.

**Kịch bản chấp nhận**:

1. **Cho trước** profile đã được lưu thành công nhưng vị trí shortcut không thể ghi, **Khi** đồng bộ shortcut thất bại, **Thì** kết quả cho biết profile đã lưu và shortcut chưa đồng bộ.
2. **Cho trước** lần đồng bộ trước thất bại, **Khi** nguyên nhân được khắc phục và người dùng thử lại, **Thì** shortcut được đồng bộ cho profile hiện có mà không tạo profile mới.
3. **Cho trước** shortcut hợp lệ đang tồn tại, **Khi** lần cập nhật mới thất bại giữa chừng, **Thì** shortcut cũ vẫn dùng được và không xuất hiện nội dung dở dang.
4. **Cho trước** công cụ làm mới cơ sở dữ liệu menu không có trên máy, **Khi** shortcut hợp lệ được tạo, **Thì** việc tạo shortcut không bị coi là thất bại chỉ vì thiếu công cụ đó.

---

### User Story 4 - Biết rõ mức hỗ trợ của môi trường desktop (Ưu tiên: P3)

Người dùng và người nghiệm thu biết shortcut đã được kiểm tra trên môi trường Linux nào, bao gồm khả năng tìm trong menu, gắn icon, pin và khôi phục runner, thay vì nhận một tuyên bố hỗ trợ chung không có bằng chứng.

**Lý do ưu tiên**: Hành vi menu và ghép cửa sổ phụ thuộc desktop session; báo cáo giới hạn rõ ràng quan trọng hơn việc tuyên bố hỗ trợ không thể kiểm chứng.

**Kiểm thử độc lập**: Trên từng môi trường khả dụng, cài một shortcut thử nghiệm và ghi riêng kết quả tìm kiếm, mở, mở lặp, icon và pin/unpin; môi trường chưa có phải được ghi là chưa kiểm thử.

**Kịch bản chấp nhận**:

1. **Cho trước** một môi trường KDE Plasma hoặc GNOME khả dụng, **Khi** chạy nghiệm thu shortcut, **Thì** kết quả thực tế cho menu, mở profile, icon và pin/unpin được ghi riêng cho backend hiển thị đang dùng.
2. **Cho trước** một môi trường chưa thể kiểm thử, **Khi** hoàn tất báo cáo Phase 4, **Thì** môi trường đó được ghi là chưa kiểm thử hoặc có giới hạn, không được suy luận từ môi trường khác.

### Trường hợp biên

- Biến thư mục dữ liệu desktop rỗng, tương đối hoặc không được đặt phải dùng vị trí người dùng hợp lệ và không ghi ra ngoài phạm vi dự kiến.
- ID profile chứa traversal, ký tự không hợp lệ hoặc vượt giới hạn phải bị từ chối trước mọi thay đổi shortcut.
- Tên hoặc đường dẫn icon chứa khoảng trắng, dấu nháy, dấu gạch chéo ngược, dấu đô la, dấu backtick hoặc dấu phần trăm phải được biểu diễn đúng và không tạo thêm lệnh, trường hoặc hành động ngoài ý muốn.
- Giá trị chứa xuống dòng, ký tự null hoặc ký tự điều khiển có thể làm thay đổi cấu trúc shortcut phải bị từ chối.
- Launcher bị thiếu, không có quyền chạy hoặc runtime cần thiết không tồn tại phải trả lỗi nêu rõ thành phần thiếu.
- Lỗi tạo thư mục, ghi, đồng bộ hoặc thay thế file không được làm hỏng shortcut đang dùng hay làm yếu quyền riêng tư của registry profile.
- Hai profile có tên hiển thị giống nhau vẫn phải mở đúng runner theo định danh riêng và không ghi đè shortcut của nhau.
- File của ứng dụng khác, shortcut của profile khác và dữ liệu phiên đăng nhập phải được giữ nguyên khi gỡ shortcut.
- Menu desktop có độ trễ cập nhật phải được phân biệt với lỗi tạo shortcut; kết quả không được dựa duy nhất vào việc gọi một tiện ích hệ thống thành công.

## Yêu cầu *(bắt buộc)*

### Yêu cầu chức năng

- **FR-001**: Hệ thống PHẢI cho phép trạng thái bật/tắt shortcut được điều khiển bởi cấu hình của từng profile.
- **FR-002**: Hệ thống PHẢI quản lý tối đa một shortcut ổn định cho mỗi ID profile hợp lệ.
- **FR-003**: Shortcut PHẢI hiển thị tên hiện tại của profile và dùng icon profile hợp lệ hoặc icon dự phòng an toàn.
- **FR-004**: Shortcut PHẢI mở đúng profile bằng launcher đã cài, không phụ thuộc thư mục làm việc hoặc môi trường phát triển.
- **FR-005**: Mở lặp cùng shortcut PHẢI khôi phục runner hiện có theo cơ chế một instance của profile và không tạo runner trùng.
- **FR-006**: Đồng bộ shortcut PHẢI tạo mục mới khi thiếu, cập nhật khi nội dung thay đổi và báo không thay đổi khi nội dung đã khớp.
- **FR-007**: Tắt shortcut hoặc xóa profile PHẢI gỡ đúng shortcut thuộc profile; yêu cầu gỡ phải có thể lặp an toàn.
- **FR-008**: Hệ thống PHẢI xác thực ID profile và dữ liệu dùng trong shortcut trước mọi thao tác với hệ thống tệp.
- **FR-009**: Hệ thống PHẢI xử lý tên, đường dẫn và đối số chứa ký tự đặc biệt mà không cho phép chèn lệnh, trường hoặc hành động ngoài ý muốn.
- **FR-010**: Hệ thống PHẢI từ chối ký tự điều khiển có thể làm thay đổi cấu trúc hoặc ý nghĩa của shortcut.
- **FR-011**: Shortcut PHẢI được cài trong phạm vi tài khoản người dùng theo quy ước thư mục desktop của Linux và không yêu cầu quyền quản trị hệ thống.
- **FR-012**: Cập nhật shortcut PHẢI bảo toàn phiên bản dùng được gần nhất nếu thao tác ghi hoặc thay thế thất bại.
- **FR-013**: Quyền truy cập shortcut PHẢI đủ để desktop session đọc được nhưng không được làm yếu quyền riêng tư của registry hoặc dữ liệu phiên.
- **FR-014**: Kết quả lưu profile và kết quả đồng bộ shortcut PHẢI được báo riêng để lỗi shortcut không âm thầm đảo ngược hoặc che khuất việc lưu profile đã thành công.
- **FR-015**: Thử lại sau lỗi PHẢI chỉ đồng bộ shortcut cho profile hiện có và không tạo profile trùng.
- **FR-016**: Việc tạo shortcut hợp lệ KHÔNG ĐƯỢC phụ thuộc vào sự hiện diện hoặc thành công của một tiện ích làm mới menu tùy chọn.
- **FR-017**: Hệ thống PHẢI cung cấp lỗi có thể hành động khi launcher đã cài bị thiếu, không thể chạy hoặc thiếu runtime cần thiết.
- **FR-018**: Việc xóa shortcut KHÔNG ĐƯỢC xóa dữ liệu phiên, icon gốc do người dùng cung cấp, file của ứng dụng khác hoặc shortcut của profile khác.
- **FR-019**: Báo cáo nghiệm thu PHẢI ghi riêng kết quả menu, mở profile, mở lặp, icon và pin/unpin cho từng tổ hợp desktop/backend thực tế được kiểm tra.
- **FR-020**: Hệ thống KHÔNG ĐƯỢC tự động pin/unpin shortcut, nhận URL từ shortcut, cung cấp hành động chỉnh sửa chưa hỗ trợ hoặc thực hiện cài đặt toàn hệ thống trong Phase 4.

### Thực thể chính

- **Profile**: Cấu hình website độc lập có ID bất biến, tên hiển thị, icon tùy chọn và lựa chọn bật/tắt shortcut.
- **Shortcut profile**: Mục khởi chạy do ứng dụng quản lý, liên kết một-một với ID profile và phản ánh tên, icon cùng đích khởi chạy hiện tại.
- **Launcher đã cài**: Điểm vào ổn định có thể mở ứng dụng ngoài môi trường phát triển và chuyển đúng định danh profile.
- **Kết quả đồng bộ shortcut**: Trạng thái cho biết shortcut đã được tạo, cập nhật, gỡ, không thay đổi hoặc gặp lỗi có thể thử lại.
- **Kết quả nghiệm thu môi trường**: Bằng chứng theo từng desktop/backend về khả năng tìm, mở, ghép icon và pin shortcut.

### Giới hạn phạm vi

- Bao gồm tạo, cập nhật, gỡ, kiểm tra an toàn và nghiệm thu shortcut cấp người dùng cho từng profile.
- Bao gồm chốt một đường launcher cài đặt được và tài liệu cách cài, cập nhật, gỡ launcher phục vụ shortcut.
- Không bao gồm giao diện CRUD Manager, bridge giao diện đầy đủ hoặc quy trình xóa dữ liệu phiên; các phần này thuộc Phase 5.
- Không bao gồm tự động pin/unpin, shortcut nhận URL, hành động chỉnh sửa profile từ menu hoặc cài đặt toàn hệ thống.
- Không cam kết hành vi icon/pin giống nhau trên mọi desktop/backend khi chưa có bằng chứng thực tế.

## Tiêu chí thành công *(bắt buộc)*

### Kết quả đo lường được

- **SC-001**: 100% shortcut sinh từ bộ profile hợp lệ vượt qua kiểm tra cấu trúc chuẩn khi môi trường có công cụ kiểm tra tương ứng.
- **SC-002**: 100% ca mở shortcut với thư mục làm việc khác và môi trường biến đường dẫn tối thiểu mở đúng profile hoặc trả lỗi nêu đúng thành phần cài đặt bị thiếu.
- **SC-003**: Trong 10 lần mở liên tiếp cùng shortcut ở các trạng thái đang khởi động, thu nhỏ và ẩn, không lần nào tạo runner thứ hai cho cùng profile.
- **SC-004**: Chuỗi bật, đồng bộ lại, đổi tên/icon, tắt và tắt lại đạt đúng một shortcut hoặc không có shortcut theo trạng thái mong đợi, không để lại bản sao hay mục cũ.
- **SC-005**: 100% ca ID traversal và dữ liệu chứa ký tự điều khiển trong bộ kiểm thử bị từ chối trước khi tạo, sửa hoặc xóa file.
- **SC-006**: 100% ca ký tự đặc biệt được hỗ trợ giữ nguyên tên/đường dẫn sau khi đọc lại và không sinh đối số, trường hoặc hành động ngoài ý muốn.
- **SC-007**: Trong mọi ca lỗi ghi hoặc thay thế được mô phỏng, shortcut hợp lệ trước đó và registry profile vẫn đọc được với quyền riêng tư không thay đổi.
- **SC-008**: Người dùng có thể tìm và mở một profile đã cài từ menu desktop trong tối đa 30 giây mà không dùng terminal trên mỗi môi trường đã được xác nhận hỗ trợ.
- **SC-009**: Báo cáo Phase 4 ghi kết quả hoặc trạng thái chưa kiểm thử cho 100% tổ hợp KDE Plasma/GNOME và X11/Wayland được liệt kê trong ma trận nghiệm thu.

## Giả định

- Profile, ID và cấu hình desktop đầu vào đã tuân thủ hợp đồng validation hiện có; Phase 4 vẫn xác thực lại dữ liệu tại ranh giới thao tác shortcut.
- Cơ chế một runner cho mỗi profile và khả năng khôi phục runner đã có từ các phase trước.
- Một launcher dành cho môi trường phát triển đã tồn tại, nhưng Phase 4 phải chốt cách cài dùng được ngoài checkout phát triển trước khi nghiệm thu menu.
- Icon profile, nếu có, đã được kiểm tra và quản lý bởi ứng dụng; nếu không đáp ứng điều kiện thì dùng icon theme dự phòng.
- Đồng bộ shortcut không tự ghi registry; workflow quản lý profile chịu trách nhiệm phối hợp hai kết quả mà không rollback âm thầm.
- Manager GUI chưa nối đầy đủ trong Phase 4; hành vi đồng bộ có thể được kiểm thử qua dữ liệu và luồng tích hợp cấp main trước khi Phase 5 cung cấp UI.
- Desktop session có thể cập nhật menu không tức thời; nghiệm thu dùng trạng thái quan sát thực tế và ghi rõ độ trễ hoặc giới hạn môi trường.
- Mức hỗ trợ tách icon và pin phụ thuộc danh tính cửa sổ đã đo trên backend đang dùng; kết quả của X11 không được suy sang Wayland và ngược lại.
