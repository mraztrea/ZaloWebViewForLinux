# Đặc tả tính năng: Manager Phase 5 và nghiệm thu đầu cuối

**Nhánh tính năng**: `007-phase5-manager`

**Ngày tạo**: 2026-09-13

**Trạng thái**: Nháp

**Đầu vào**: Mô tả của người dùng: "Đọc tài liệu trong docs/phases/phase-5-manager/ và bắt đầu triển khai phase 5. Đang ở branch develop, hãy tạo branch, không sử dụng branch 006 đã có sẵn. Ở bước này chỉ tạo tài liệu specs thôi"

**Nguồn nghiệp vụ**: `docs/phases/phase-5-manager/spec.md` (yêu cầu P5-01…P5-12), `docs/phases/phase-5-manager/plan.md` (đầu việc P5-T1…P5-T5). Phạm vi tương ứng Task 7–8 của kế hoạch tổng. Ghi chú: nhánh `006-manager-dashboard` đã tồn tại nên đặc tả này được tạo trên nhánh `007-phase5-manager` để tránh xung đột; nội dung nghiệp vụ kế thừa cùng nguồn phase 5.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quản lý profile tập trung (Priority: P1)

Người dùng mở Manager để xem toàn bộ profile gồm tên, địa chỉ website, biểu tượng, trạng thái runner và trạng thái cảnh báo. Họ có thể tìm kiếm, thêm mới và chỉnh sửa profile mà không cần sửa tệp cấu hình thủ công.

**Why this priority**: Đây là giá trị cốt lõi của Manager. Nếu danh sách và biểu mẫu không phản ánh đúng dữ liệu thật thì mọi thao tác mở runner, thử XPath và shortcut phía sau đều không đáng tin cậy.

**Independent Test**: Chuẩn bị nhiều profile, mở Manager, tìm kiếm theo tên hoặc địa chỉ, thêm một profile rồi sửa toàn bộ trường của profile đó; dữ liệu hiển thị và dữ liệu đọc lại phải khớp, kể cả các lựa chọn đang tắt.

**Acceptance Scenarios**:

1. **Given** chưa có profile, **When** người dùng mở Manager, **Then** giao diện phân biệt rõ trạng thái đang tải, danh sách rỗng và lỗi đọc dữ liệu.
2. **Given** có nhiều profile, **When** người dùng tìm theo một phần tên hoặc địa chỉ, **Then** chỉ các profile phù hợp được hiển thị mà dữ liệu gốc không thay đổi.
3. **Given** biểu mẫu tạo mới hợp lệ, **When** người dùng lưu, **Then** profile mới nhận định danh riêng, xuất hiện trong danh sách và biểu mẫu chỉ đóng sau khi dữ liệu đã được lưu xong.
4. **Given** một profile có các lựa chọn bật và tắt khác nhau, **When** người dùng sửa rồi lưu, **Then** mọi trường được giữ đúng, định danh và thời điểm tạo không đổi; lỗi lưu giữ nguyên dữ liệu đang nhập để sửa hoặc thử lại.
5. **Given** tên profile chứa chuỗi giống nội dung đánh dấu hoặc lệnh nhúng, **When** Manager hiển thị profile, **Then** tên được hiển thị nguyên văn và không tạo nội dung hay hành động ngoài ý muốn.

---

### User Story 2 - Mở runner và theo dõi trạng thái độc lập (Priority: P1)

Người dùng mở runner của từng profile từ Manager, biết runner đang chạy, đã dừng hay chưa thể xác định, xem số cảnh báo và xóa cảnh báo đúng profile. Manager có thể đóng hoặc mở lại mà không làm gián đoạn các runner đang hoạt động.

**Why this priority**: Manager phải là bảng điều khiển đáng tin cậy nhưng không trở thành điểm lỗi chung làm đóng các phiên website độc lập.

**Independent Test**: Mở hai runner từ Manager, tạo trạng thái cảnh báo riêng, xóa cảnh báo của một profile, đóng rồi mở lại Manager và mở lặp cùng profile; mỗi runner giữ trạng thái độc lập và không có phiên trùng.

**Acceptance Scenarios**:

1. **Given** runner chưa chạy, **When** người dùng yêu cầu mở profile, **Then** Manager xác nhận đã gửi yêu cầu mở nhưng chỉ báo runner sẵn sàng sau khi có trạng thái xác thực.
2. **Given** runner đang chạy, thu nhỏ hoặc ẩn, **When** người dùng mở lại cùng profile, **Then** cửa sổ hiện có được khôi phục và không tạo runner thứ hai.
3. **Given** hai profile có trạng thái cảnh báo khác nhau, **When** người dùng xóa cảnh báo hoặc focus runner của một profile, **Then** trạng thái của profile kia không bị thay đổi.
4. **Given** Manager bị đóng trong khi runner đang chạy, **When** người dùng mở lại Manager, **Then** runner vẫn hoạt động và trạng thái hiện tại được hiển thị lại.
5. **Given** không thể liên lạc với runner, **When** Manager làm mới trạng thái, **Then** trạng thái được ghi là chưa thể xác định thay vì khẳng định runner đã dừng.

---

### User Story 3 - Hoàn thiện cấu hình bằng công cụ hỗ trợ (Priority: P2)

Người dùng chọn hoặc tải biểu tượng, bật shortcut và thử biểu thức XPath trên đúng trang đang mở trước khi chấp nhận cấu hình. Mỗi thao tác trả kết quả riêng, rõ ràng và không làm mất phần cấu hình đã lưu thành công.

**Why this priority**: Biểu tượng, shortcut và XPath làm profile hữu ích khi dùng hằng ngày, nhưng lỗi của một phần không được che khuất hay đảo ngược phần khác đã thành công.

**Independent Test**: Chọn biểu tượng cục bộ hoặc tải từ website, lưu profile khi đồng bộ shortcut bị lỗi, sau đó thử XPath với các kết quả khớp, không khớp và đầu vào sai; profile đã lưu phải còn nguyên và mỗi lỗi có hướng dẫn thử lại phù hợp.

**Acceptance Scenarios**:

1. **Given** profile hợp lệ và shortcut chưa bật, **When** người dùng bật shortcut rồi lưu, **Then** kết quả lưu profile và kết quả đồng bộ shortcut được thông báo riêng.
2. **Given** profile đã lưu nhưng đồng bộ shortcut thất bại, **When** người dùng khắc phục nguyên nhân và thử lại, **Then** shortcut được đồng bộ cho profile hiện có mà không tạo profile trùng.
3. **Given** cấu hình đang được một runner sử dụng, **When** người dùng lưu thay đổi cần mở lại runner, **Then** Manager hiển thị rõ trạng thái cần mở lại thay vì ngụ ý thay đổi đã có hiệu lực.
4. **Given** runner đúng profile đang tải trang hoặc chưa sẵn sàng, **When** người dùng thử XPath, **Then** Manager hướng dẫn mở hoặc chờ runner và không báo kết quả của tài liệu cũ.
5. **Given** XPath hợp lệ, không khớp, sai cú pháp, sai dữ liệu hoặc hết thời gian chờ, **When** phép thử hoàn tất, **Then** Manager phân biệt từng kết quả và phép thử không thay đổi cấu hình, mốc so sánh hay tạo cảnh báo mới.
6. **Given** biểu tượng cục bộ bị mất hoặc biểu tượng tải từ xa hỏng, quá lớn, chuyển hướng không an toàn hay hết thời gian chờ, **When** Manager xử lý biểu tượng, **Then** profile vẫn dùng được với biểu tượng dự phòng và người dùng nhận thông báo phù hợp.

---

### User Story 4 - Xóa profile và dữ liệu phiên có chủ đích (Priority: P2)

Người dùng xóa một profile sau khi runner đã dừng, trong khi dữ liệu phiên đăng nhập được giữ lại theo mặc định. Nếu muốn xóa cả dữ liệu phiên, người dùng thực hiện một hành động riêng với xác nhận nêu rõ định danh và phạm vi dữ liệu.

**Why this priority**: Xóa nhầm phiên đăng nhập khó khôi phục; tách hai hành động giúp thao tác thường dùng an toàn mà vẫn cho phép dọn dữ liệu khi người dùng chủ động yêu cầu.

**Independent Test**: Thử xóa một profile đang chạy, mô phỏng dừng thất bại, sau đó dừng thành công và xóa profile; xác nhận dữ liệu phiên vẫn còn. Tiếp tục thử hành động xóa phiên với cả lựa chọn hủy và xác nhận.

**Acceptance Scenarios**:

1. **Given** runner còn chạy hoặc trạng thái chưa thể xác định, **When** người dùng yêu cầu xóa profile, **Then** hệ thống không xóa dữ liệu đã lưu hay shortcut và nêu rõ cần dừng runner an toàn.
2. **Given** runner đã xác nhận dừng, **When** người dùng xóa profile, **Then** shortcut liên quan được gỡ trước khi profile biến mất và dữ liệu phiên được giữ lại theo mặc định.
3. **Given** một profile đã bị xóa nhưng còn dữ liệu phiên, **When** người dùng tạo profile mới cùng tên, **Then** profile mới không tự nhận lại phiên cũ.
4. **Given** hành động xóa phiên riêng, **When** người dùng hủy xác nhận, **Then** không có dữ liệu nào thay đổi.
5. **Given** hành động xóa phiên riêng, **When** người dùng xác nhận, **Then** chỉ dữ liệu phiên của đúng profile mục tiêu bị xóa sau khi đã kiểm tra runner dừng và phạm vi cho phép.

---

### User Story 5 - Nghiệm thu đầu cuối có bằng chứng (Priority: P2)

Người dùng (hoặc người bàn giao) thực hiện chuỗi thao tác đầy đủ từ thêm profile, mở runner, đăng nhập, thử XPath, nhận cảnh báo, xóa cảnh báo, dùng shortcut, mở lặp, sửa rồi xóa; đồng thời kiểm tra các lỗi như dữ liệu hỏng, lỗi ghi, lỗi mạng, runner sập và kết nối cũ. Kết quả được ghi lại theo từng môi trường desktop thực tế thay vì kết luận dự đoán.

**Why this priority**: Đây là điều kiện bàn giao của phase 5. Không có chuỗi đầu cuối và báo cáo thực thì Manager chưa thể coi là hoàn thành dù từng màn hình riêng lẻ đã chạy.

**Independent Test**: Thực hiện toàn bộ chuỗi trên một desktop có sẵn, ghi lại từng bước đạt hay chưa đạt kèm bằng chứng; các môi trường không truy cập được giữ nguyên trạng thái chưa kiểm thử.

**Acceptance Scenarios**:

1. **Given** một profile mới, **When** thực hiện đủ chuỗi thêm, mở, đăng nhập, thử XPath, nhận cảnh báo, xóa cảnh báo, dùng shortcut, mở lặp, sửa rồi xóa, **Then** mỗi bước đều có kết quả quan sát được và dữ liệu không bị mất ngoài ý muốn.
2. **Given** dữ liệu cấu hình hỏng, lỗi ghi, lỗi mạng, runner sập hoặc kết nối cũ, **When** các lỗi này xảy ra trong chuỗi, **Then** dữ liệu người dùng được giữ an toàn và mỗi lỗi có hướng xử lý hoặc thử lại.
3. **Given** bản phân phối và bản phát triển, **When** kiểm tra cài đặt và chạy theo hướng dẫn, **Then** mỗi bản có báo cáo riêng gồm phiên bản, lệnh đã chạy, kết quả và bằng chứng.

### Edge Cases

- Dữ liệu cấu hình hỏng: báo lỗi rõ ràng, không giả danh sách rỗng và không ghi đè mất dữ liệu.
- Runner xác nhận đã nhận lệnh dừng nhưng tiến trình vẫn còn: chưa được coi là đã dừng, không cho xóa profile.
- Kết quả thử XPath đến từ tài liệu cũ sau khi trang chuyển hướng: phải bỏ qua, không hiển thị như kết quả hiện tại.
- Biểu tượng vượt giới hạn kích thước, sai định dạng hoặc tải quá lâu: dùng biểu tượng dự phòng và nêu lý do.
- Người dùng thao tác hoàn toàn bằng bàn phím: mọi chức năng chính đều tiếp cận được, phím thoát đóng hộp thoại và trả focus về vị trí hợp lý.
- Giao diện tải lại khi cửa sổ đang ẩn: không tiếp tục thăm dò trạng thái runner nền.
- Môi trường desktop không truy cập được: ghi nhận chưa kiểm thử, không ghi đạt hay không hỗ trợ nếu chưa có bằng chứng.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Manager PHẢI hiển thị danh sách profile gồm tên, địa chỉ, biểu tượng, trạng thái runner và trạng thái cảnh báo.
- **FR-002**: Người dùng PHẢI có thể tìm kiếm profile theo tên hoặc địa chỉ mà không làm thay đổi dữ liệu gốc.
- **FR-003**: Người dùng PHẢI có thể thêm profile mới và sửa mọi trường của profile đã có; định danh và thời điểm tạo không được thay đổi khi sửa.
- **FR-004**: Hệ thống PHẢI giữ nguyên dữ liệu đang nhập khi lưu thất bại và chỉ đóng biểu mẫu sau khi lưu thành công.
- **FR-005**: Người dùng PHẢI có thể mở runner của từng profile từ Manager; mở lặp cùng profile chỉ khôi phục cửa sổ hiện có.
- **FR-006**: Hệ thống PHẢI phân biệt trạng thái runner đang chạy, đã dừng và chưa thể xác định; trạng thái chưa xác định không được báo là đã dừng.
- **FR-007**: Người dùng PHẢI có thể xem và xóa trạng thái cảnh báo theo từng profile mà không ảnh hưởng profile khác.
- **FR-008**: Kết quả lưu profile và kết quả đồng bộ shortcut PHẢI được thông báo riêng; thất bại một phần cho phép thử lại mà không tạo bản trùng.
- **FR-009**: Khi cấu hình thay đổi cần mở lại runner, hệ thống PHẢI hiển thị trạng thái cần mở lại.
- **FR-010**: Người dùng PHẢI có thể thử biểu thức XPath trên đúng runner và tài liệu hiện tại của profile đã lưu, với các kết quả khớp, không khớp, cú pháp sai, dữ liệu sai, đang tải và hết thời gian chờ được phân biệt rõ.
- **FR-011**: Phép thử XPath KHÔNG ĐƯỢC thay đổi cấu hình, mốc so sánh hay tạo cảnh báo mới.
- **FR-012**: Người dùng PHẢI có thể chọn biểu tượng cục bộ hoặc tải từ địa chỉ website với giới hạn an toàn; mọi thất bại dùng biểu tượng dự phòng kèm lý do và không làm mất cấu hình.
- **FR-013**: Xóa profile CHỈ ĐƯỢC thực hiện sau khi runner đã xác nhận dừng; dữ liệu phiên được giữ lại theo mặc định.
- **FR-014**: Xóa dữ liệu phiên PHẢI là hành động riêng với xác nhận nêu rõ định danh và phạm vi; hủy xác nhận không thay đổi dữ liệu.
- **FR-015**: Profile mới tạo KHÔNG ĐƯỢC nhận lại dữ liệu phiên còn sót của profile cùng tên đã xóa.
- **FR-016**: Giao diện PHẢI hiển thị nguyên văn tên profile chứa nội dung giống mã đánh dấu và vận hành được bằng bàn phím, bao gồm trạng thái tải, rỗng và lỗi phân biệt rõ.
- **FR-017**: Hệ thống PHẢI từ chối yêu cầu quản lý đến từ nguồn không tin cậy (website bên ngoài, khung nhúng, dữ liệu sai kiểu) và không để lộ cơ chế gọi chung cho phía hiển thị.
- **FR-018**: Bàn giao PHẢI gồm chuỗi kiểm thử đầu cuối đầy đủ và báo cáo riêng cho bản phát triển và bản phân phối, ghi rõ môi trường desktop, phiên bản, thao tác, kết quả và bằng chứng; môi trường chưa kiểm thử được giữ nguyên trạng thái đó.

### Key Entities *(include if feature involves data)*

- **Profile**: Hồ sơ website độc lập gồm định danh, tên, địa chỉ, biểu tượng, chế độ theo dõi, chu kỳ kiểm tra và các tùy chọn hiển thị; định danh và thời điểm tạo bất biến sau khi tạo.
- **Trạng thái runner**: Trạng thái vòng đời của runner theo từng profile gồm đang chạy, đã dừng và chưa thể xác định, kèm dữ liệu trạng thái và phiên bản cấu hình đang dùng khi liên lạc được.
- **Kết quả thử XPath**: Kết quả đánh giá biểu thức trên tài liệu hiện tại gồm khớp, không khớp, cú pháp sai, dữ liệu sai, đang tải và hết thời gian chờ.
- **Kết quả đồng bộ shortcut**: Kết quả riêng của thao tác shortcut sau khi lưu profile, gồm thành công, thất bại từng phần và yêu cầu mở lại runner.
- **Biểu tượng**: Ảnh đại diện của profile từ tệp cục bộ hoặc tải từ website, luôn có ảnh dự phòng khi thất bại.
- **Dữ liệu phiên**: Dữ liệu đăng nhập và trạng thái website được giữ lại sau khi xóa profile, chỉ xóa bằng hành động riêng có xác nhận.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Người dùng hoàn thành thêm một profile mới trong vòng dưới 3 phút kể từ khi mở Manager.
- **SC-002**: Người dùng tìm đúng profile trong danh sách 50 profile trong vòng dưới 30 giây.
- **SC-003**: 100% thao tác lưu thất bại giữ nguyên dữ liệu đang nhập để người dùng thử lại mà không nhập lại từ đầu.
- **SC-004**: 100% thao tác xóa profile khi runner còn chạy hoặc chưa xác định bị chặn và giữ nguyên dữ liệu.
- **SC-005**: 100% phép thử XPath phân biệt đúng 6 loại kết quả (khớp, không khớp, cú pháp sai, dữ liệu sai, đang tải, hết thời gian chờ) trong kiểm thử chấp nhận.
- **SC-006**: Người dùng chỉ dùng bàn phím vẫn hoàn thành được các thao tác chính (mở, thêm, sửa, xóa, thử XPath).
- **SC-007**: Chuỗi đầu cuối đầy đủ được thực hiện thành công trên ít nhất 1 môi trường desktop thực với báo cáo và bằng chứng đi kèm.

## Assumptions

- Tái sử dụng cơ chế quản lý profile, kênh liên lạc runner và cơ chế cảnh báo hiện có; không xây công cụ theo dõi XPath hay thông báo mới.
- Việc xác nhận đăng nhập do người dùng thực hiện trực tiếp trên runner; giao diện hướng dẫn mở đúng runner khi chưa thể xác nhận.
- Shortcut hệ thống và đường mở runner của phase trước đã hoạt động; phần đồng bộ và gỡ shortcut trong phase này dựa trên kết quả bàn giao đó.
- Giới hạn an toàn cho tải biểu tượng: chỉ chấp nhận địa chỉ hợp lệ qua từng bước chuyển hướng, dung lượng và kích thước ảnh có trần, thời gian chờ tổng hữu hạn, không dùng cookie phiên của website.
- Báo cáo nghiệm thu chỉ ghi kết quả quan sát thực tế; môi trường không truy cập được giữ trạng thái chưa kiểm thử.
- Phạm vi kỹ thuật chi tiết (tên cầu nối, tệp mã nguồn, kế hoạch kiểm thử tự động) thuộc bước lập kế hoạch, không thuộc đặc tả này.
