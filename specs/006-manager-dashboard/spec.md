# Đặc tả tính năng: Manager Dashboard và nghiệm thu đầu cuối

**Nhánh tính năng**: `006-manager-dashboard`

**Ngày tạo**: 2026-09-13

**Trạng thái**: Nháp

**Đầu vào**: Mô tả của người dùng: "Đọc tài liệu trong docs/phases/phase-5-manager và các tài liệu liên quan, thực hiện triển khai Phase 5"

## Kịch bản người dùng và kiểm thử *(bắt buộc)*

### User Story 1 - Quản lý và tìm profile tập trung (Ưu tiên: P1)

Người dùng mở Manager để xem toàn bộ profile cùng tên, địa chỉ, icon, trạng thái runner và trạng thái cảnh báo; họ có thể tìm kiếm, thêm mới hoặc chỉnh sửa profile mà không cần thao tác trực tiếp trên tệp cấu hình.

**Lý do ưu tiên**: Đây là giá trị cốt lõi của Manager. Nếu danh sách và biểu mẫu không phản ánh đúng dữ liệu thật, mọi thao tác điều khiển runner, XPath và shortcut phía sau đều không đáng tin cậy.

**Kiểm thử độc lập**: Chuẩn bị danh sách có nhiều profile, mở Manager, tìm kiếm theo tên hoặc địa chỉ, thêm một profile rồi sửa toàn bộ trường của profile đó; dữ liệu hiển thị và dữ liệu đọc lại phải khớp, kể cả các lựa chọn đang tắt.

**Kịch bản chấp nhận**:

1. **Cho trước** chưa có profile, **Khi** người dùng mở Manager, **Thì** giao diện phân biệt rõ trạng thái đang tải, danh sách rỗng và lỗi đọc dữ liệu.
2. **Cho trước** có nhiều profile, **Khi** người dùng tìm theo một phần tên hoặc địa chỉ, **Thì** chỉ các profile phù hợp được hiển thị mà dữ liệu gốc không thay đổi.
3. **Cho trước** biểu mẫu tạo mới hợp lệ, **Khi** người dùng lưu, **Thì** profile mới nhận định danh riêng, xuất hiện trong danh sách và biểu mẫu chỉ đóng sau khi dữ liệu đã được lưu.
4. **Cho trước** một profile có các lựa chọn bật và tắt khác nhau, **Khi** người dùng sửa rồi lưu, **Thì** mọi trường được giữ đúng, định danh và thời điểm tạo không đổi, còn lỗi lưu giữ nguyên dữ liệu đang nhập để người dùng sửa hoặc thử lại.
5. **Cho trước** tên profile chứa chuỗi giống nội dung đánh dấu hoặc lệnh nhúng, **Khi** Manager hiển thị profile, **Thì** tên được hiển thị nguyên văn và không tạo nội dung hay hành động ngoài ý muốn.

---

### User Story 2 - Mở runner và theo dõi trạng thái độc lập (Ưu tiên: P1)

Người dùng mở runner của từng profile từ Manager, biết runner đang chạy, đã dừng hay chưa thể xác định, xem số cảnh báo và xóa cảnh báo cho đúng profile. Manager có thể đóng hoặc mở lại mà không làm gián đoạn các runner đang hoạt động.

**Lý do ưu tiên**: Manager phải là bảng điều khiển đáng tin cậy nhưng không trở thành điểm lỗi chung làm đóng các phiên website độc lập.

**Kiểm thử độc lập**: Mở hai runner từ Manager, tạo trạng thái cảnh báo riêng, xóa cảnh báo của một profile, đóng rồi mở lại Manager và mở lặp cùng profile; mỗi runner phải giữ trạng thái độc lập và không có phiên trùng.

**Kịch bản chấp nhận**:

1. **Cho trước** runner chưa chạy, **Khi** người dùng yêu cầu mở profile, **Thì** Manager xác nhận đã gửi yêu cầu mở nhưng chỉ báo runner sẵn sàng sau khi có trạng thái xác thực.
2. **Cho trước** runner đang khởi động, thu nhỏ hoặc ẩn, **Khi** người dùng mở lại cùng profile, **Thì** cửa sổ hiện có được khôi phục và không tạo runner thứ hai.
3. **Cho trước** hai profile có trạng thái cảnh báo khác nhau, **Khi** người dùng xóa cảnh báo hoặc focus runner của một profile, **Thì** trạng thái của profile kia không bị thay đổi.
4. **Cho trước** Manager bị đóng trong khi runner đang chạy, **Khi** người dùng mở lại Manager, **Thì** runner vẫn hoạt động và trạng thái hiện tại được hiển thị lại.
5. **Cho trước** không thể liên lạc với runner, **Khi** Manager làm mới trạng thái, **Thì** trạng thái được ghi là chưa thể xác định thay vì khẳng định runner đã dừng.

---

### User Story 3 - Hoàn thiện cấu hình profile bằng công cụ hỗ trợ (Ưu tiên: P2)

Người dùng có thể chọn hoặc tải icon, bật shortcut và thử biểu thức XPath trên đúng trang đang mở trước khi chấp nhận cấu hình. Mỗi thao tác trả kết quả riêng, rõ ràng và không làm mất phần cấu hình đã lưu thành công.

**Lý do ưu tiên**: Icon, shortcut và XPath làm profile hữu ích trong sử dụng hằng ngày, nhưng lỗi của một phần không được che khuất hay đảo ngược phần khác đã thành công.

**Kiểm thử độc lập**: Chọn icon cục bộ hoặc tải icon từ website, lưu profile khi đồng bộ shortcut bị lỗi, sau đó thử XPath với các kết quả khớp, không khớp và đầu vào sai; profile đã lưu phải còn nguyên và mỗi lỗi có hướng dẫn thử lại phù hợp.

**Kịch bản chấp nhận**:

1. **Cho trước** profile hợp lệ và shortcut chưa bật, **Khi** người dùng bật shortcut rồi lưu, **Thì** kết quả lưu profile và kết quả đồng bộ shortcut được thông báo riêng.
2. **Cho trước** profile đã lưu nhưng shortcut đồng bộ thất bại, **Khi** người dùng khắc phục nguyên nhân và thử lại, **Thì** shortcut được đồng bộ cho profile hiện có mà không tạo profile trùng.
3. **Cho trước** cấu hình đang được một runner sử dụng, **Khi** người dùng lưu thay đổi cần mở lại runner, **Thì** Manager hiển thị rõ trạng thái cần mở lại thay vì ngụ ý thay đổi đã có hiệu lực.
4. **Cho trước** runner đúng profile đang tải trang hoặc chưa sẵn sàng, **Khi** người dùng thử XPath, **Thì** Manager hướng dẫn mở hoặc chờ runner và không báo kết quả của tài liệu cũ.
5. **Cho trước** XPath hợp lệ, không khớp, sai cú pháp, sai dữ liệu hoặc hết thời gian chờ, **Khi** phép thử hoàn tất, **Thì** Manager phân biệt từng kết quả và phép thử không thay đổi cấu hình, mốc so sánh hay tạo cảnh báo mới.
6. **Cho trước** icon cục bộ bị mất hoặc icon tải từ xa hỏng, quá lớn, chuyển hướng không an toàn hay hết thời gian chờ, **Khi** Manager xử lý icon, **Thì** profile vẫn dùng được với icon dự phòng và người dùng nhận thông báo phù hợp.

---

### User Story 4 - Xóa profile và dữ liệu phiên có chủ đích (Ưu tiên: P2)

Người dùng có thể xóa một profile sau khi runner đã dừng, trong khi phiên đăng nhập được giữ mặc định. Nếu muốn xóa cả dữ liệu phiên, người dùng phải thực hiện một hành động riêng với xác nhận rõ định danh và phạm vi dữ liệu.

**Lý do ưu tiên**: Xóa nhầm phiên đăng nhập khó khôi phục; tách hai hành động giúp thao tác thường dùng an toàn mà vẫn cho phép dọn dữ liệu khi người dùng chủ động yêu cầu.

**Kiểm thử độc lập**: Xóa một profile đang chạy, mô phỏng dừng thất bại, sau đó dừng thành công và xóa profile; xác nhận dữ liệu phiên vẫn còn. Tiếp tục thử hành động xóa phiên với cả lựa chọn hủy và xác nhận.

**Kịch bản chấp nhận**:

1. **Cho trước** runner còn chạy hoặc trạng thái chưa thể xác định, **Khi** người dùng yêu cầu xóa profile, **Thì** hệ thống không xóa registry hay shortcut và nêu rõ cần dừng runner an toàn.
2. **Cho trước** runner đã xác nhận dừng, **Khi** người dùng xóa profile, **Thì** shortcut liên quan được gỡ trước khi profile biến mất và dữ liệu phiên được giữ lại mặc định.
3. **Cho trước** một profile đã bị xóa nhưng còn dữ liệu phiên, **Khi** người dùng tạo profile mới cùng tên, **Thì** profile mới không tự nhận lại phiên cũ.
4. **Cho trước** người dùng chọn xóa dữ liệu phiên, **Khi** hộp xác nhận xuất hiện, **Thì** định danh profile và phạm vi dữ liệu bị xóa được trình bày rõ; chọn hủy không thay đổi dữ liệu.
5. **Cho trước** runner chưa dừng hoặc vị trí dữ liệu không thuộc phạm vi ứng dụng, **Khi** người dùng xác nhận xóa phiên, **Thì** thao tác bị từ chối và dữ liệu khác được giữ nguyên.

---

### User Story 5 - Nghiệm thu bản cài đặt trong môi trường Linux thực (Ưu tiên: P3)

Người dùng và người nghiệm thu có hướng dẫn cài, chạy và kiểm tra bản phát triển cùng bản phân phối; kết quả thực tế trên từng môi trường desktop được ghi lại thay vì suy luận từ kiểm thử tự động.

**Lý do ưu tiên**: Một Manager vượt qua kiểm thử nội bộ vẫn có thể hỏng khi đóng gói hoặc chạy dưới desktop session thực, đặc biệt ở preload, asset, shortcut, tray và quyền thiết bị.

**Kiểm thử độc lập**: Từ checkout sạch và từ bản phân phối, thực hiện chuỗi hai profile gồm tạo, mở, đăng nhập, thử XPath, nhận và xóa cảnh báo, bật shortcut, mở lặp, sửa và xóa; ghi kết quả theo từng môi trường khả dụng.

**Kịch bản chấp nhận**:

1. **Cho trước** một checkout sạch, **Khi** người nghiệm thu cài phụ thuộc, kiểm tra chất lượng, dựng và chạy toàn bộ kiểm thử theo hướng dẫn, **Thì** kết quả và phiên bản được ghi lại có thể tái hiện.
2. **Cho trước** một bản phân phối mới, **Khi** người nghiệm thu chạy smoke test, **Thì** Manager, runner, tài nguyên giao diện, launcher và các ranh giới bảo vệ hoạt động ngoài checkout phát triển.
3. **Cho trước** một desktop session khả dụng, **Khi** thực hiện ma trận nghiệm thu, **Thì** kết quả menu, tray, icon, pin, cảnh báo và giới hạn môi trường được ghi bằng bằng chứng thực tế.
4. **Cho trước** một tổ hợp desktop/backend không thể truy cập, **Khi** hoàn tất báo cáo, **Thì** tổ hợp đó được ghi là chưa kiểm thử, không được suy luận là đạt từ môi trường khác.

### Trường hợp biên

- Registry profile bị lỗi cú pháp, bị cắt cụt hoặc không thể đọc phải hiển thị lỗi có thể hành động, không giả thành danh sách rỗng và không ghi đè dữ liệu gốc.
- Lỗi lưu profile phải giữ nguyên biểu mẫu; thử lại không được tạo profile trùng hoặc thay đổi định danh bất biến.
- Một lựa chọn có giá trị `false` phải được giữ đúng khi sửa, không bị thay bằng giá trị mặc định do cách kiểm tra dữ liệu rỗng.
- Manager bị ẩn hoặc đóng không được tiếp tục làm mới trạng thái vô hạn; khi hiện lại phải lấy trạng thái mới thay vì dùng dữ liệu cũ.
- Runner crash, socket cũ, phản hồi trễ hoặc phản hồi từ tài liệu trước không được biến thành trạng thái thành công hay cảnh báo mới.
- Xác nhận đã nhận yêu cầu dừng không được xem là bằng chứng tiến trình đã dừng; timeout hoặc trạng thái chưa xác định phải chặn xóa.
- Shortcut gỡ lỗi hoặc không thể cập nhật phải giữ profile và dữ liệu phiên, đồng thời nêu rõ bước nào chưa hoàn tất.
- Icon từ xa chỉ được lấy qua địa chỉ web công khai an toàn; mọi chuyển hướng phải tiếp tục đáp ứng cùng điều kiện, không gửi cookie phiên, không nhận ảnh lớn hơn 2 MiB hoặc 1024×1024 pixel.
- Tên, địa chỉ, selector hoặc phản hồi chứa nội dung đánh dấu, mã nhúng hay trường thừa phải được xử lý như dữ liệu và không tạo hành động đặc quyền.
- Điều hướng, đóng runner hoặc hết thời gian chờ trong lúc thử XPath phải kết thúc phép thử; kết quả đến muộn bị bỏ qua.
- Hai profile thay đổi gần như đồng thời phải giữ timer, trạng thái, cảnh báo, shortcut và thao tác xóa độc lập.
- Upload, download, clipboard, microphone/camera bị từ chối hoặc không khả dụng phải có hành vi rõ ràng, không làm crash runner hay mất cấu hình.
- Màn hình từng lưu vị trí cửa sổ bị ngắt kết nối phải không làm cửa sổ khởi chạy ngoài vùng nhìn thấy.

## Yêu cầu *(bắt buộc)*

### Yêu cầu chức năng

- **FR-001**: Chỉ giao diện Manager đáng tin cậy ĐƯỢC PHÉP thực hiện thao tác quản lý; nội dung website, khung con và dữ liệu sai cấu trúc PHẢI bị từ chối trước khi đọc, ghi hoặc điều khiển profile.
- **FR-002**: Manager PHẢI hiển thị mỗi profile bằng một mục có icon, tên, địa chỉ, trạng thái runner và trạng thái cảnh báo hiện tại.
- **FR-003**: Manager PHẢI phân biệt rõ trạng thái đang tải, danh sách rỗng, dữ liệu sẵn sàng và lỗi đọc dữ liệu.
- **FR-004**: Người dùng PHẢI có thể tìm profile theo tên hoặc địa chỉ mà không thay đổi dữ liệu đã lưu.
- **FR-005**: Trạng thái profile PHẢI được làm mới khi Manager đang hiển thị và PHẢI ngừng làm mới khi Manager bị ẩn hoặc đóng.
- **FR-006**: Manager PHẢI cho phép tạo và sửa đầy đủ tên, địa chỉ, selector, chế độ XPath, chu kỳ kiểm tra, icon, thông tin nhận diện trình duyệt và năm lựa chọn hành vi đã định nghĩa cho profile.
- **FR-007**: Tạo mới PHẢI dùng bộ giá trị mặc định của mô hình profile; mở biểu mẫu tạo mới sau khi sửa PHẢI không giữ dữ liệu của profile trước.
- **FR-008**: Sửa profile PHẢI giữ chính xác cả giá trị bật lẫn tắt, không cho thay đổi định danh hoặc thời điểm tạo và không làm mất trường không thuộc quyền sửa của người dùng.
- **FR-009**: Lỗi xác thực hoặc lưu PHẢI giữ biểu mẫu cùng dữ liệu đang nhập; chỉ lưu thành công mới được đóng biểu mẫu.
- **FR-010**: Kết quả lưu profile và kết quả đồng bộ shortcut PHẢI được báo riêng; lỗi shortcut KHÔNG ĐƯỢC âm thầm đảo ngược hoặc che khuất profile đã lưu thành công.
- **FR-011**: Người dùng PHẢI có thể thử lại phần đồng bộ shortcut cho profile hiện có mà không tạo bản sao profile.
- **FR-012**: Khi cấu hình đã lưu khác cấu hình runner đang dùng, Manager PHẢI báo cần mở lại runner cho đến khi trạng thái xác nhận cấu hình mới đã có hiệu lực.
- **FR-013**: Yêu cầu mở profile PHẢI dùng đúng định danh và PHẢI phân biệt “đã gửi yêu cầu mở” với “runner đã sẵn sàng”.
- **FR-014**: Mở lặp một profile PHẢI khôi phục runner hiện có; đóng Manager KHÔNG ĐƯỢC đóng runner.
- **FR-015**: Khi không xác thực được trạng thái runner, Manager PHẢI hiển thị “chưa thể xác định” thay vì suy luận “đã dừng”.
- **FR-016**: Xóa cảnh báo PHẢI chỉ tác động đúng profile và KHÔNG ĐƯỢC đặt lại mốc so sánh XPath.
- **FR-017**: Người dùng PHẢI có thể thử selector và chế độ XPath đang nhập trên đúng profile và đúng tài liệu hiện hành, kể cả trước khi lưu thay đổi cấu hình.
- **FR-018**: Kết quả thử XPath PHẢI phân biệt khớp, không khớp, selector sai, dữ liệu sai, trang đang tải, lỗi kết nối và hết thời gian chờ.
- **FR-019**: Thử XPath KHÔNG ĐƯỢC sửa cấu hình, thay đổi mốc so sánh hay tạo cảnh báo; kết quả của tài liệu cũ hoặc phép thử đã kết thúc PHẢI bị bỏ qua.
- **FR-020**: Xóa profile PHẢI chỉ tiếp tục sau khi runner được xác nhận đã dừng và shortcut liên quan được gỡ thành công; timeout, trạng thái chưa xác định hoặc lỗi từng bước PHẢI giữ nguyên profile.
- **FR-021**: Xóa profile PHẢI giữ dữ liệu phiên mặc định; profile mới cùng tên KHÔNG ĐƯỢC tự tái sử dụng định danh hoặc phiên còn lại.
- **FR-022**: Xóa dữ liệu phiên PHẢI là hành động riêng, có xác nhận trong ứng dụng, nêu rõ định danh và phạm vi dữ liệu, đồng thời chỉ được phép khi runner đã dừng và mục tiêu thuộc vùng dữ liệu của ứng dụng.
- **FR-023**: Người dùng PHẢI có thể chọn icon cục bộ hoặc yêu cầu tìm icon công khai từ website; icon không hợp lệ PHẢI dùng phương án dự phòng an toàn mà không làm profile mất khả dụng.
- **FR-024**: Icon tải từ xa PHẢI giới hạn ở địa chỉ HTTP(S) công khai an toàn, xác thực lại từng chuyển hướng, không dùng cookie phiên và từ chối dữ liệu vượt 2 MiB hoặc ảnh vượt 1024×1024 pixel.
- **FR-025**: Mọi nội dung profile và phản hồi bên ngoài PHẢI được hiển thị dưới dạng dữ liệu thuần; nội dung không đáng tin cậy KHÔNG ĐƯỢC tạo đánh dấu, mã chạy hoặc thao tác đặc quyền.
- **FR-026**: Toàn bộ thao tác chính PHẢI dùng được bằng bàn phím với nhãn có thể nhận biết, thứ tự focus hợp lý, đóng bằng Escape khi phù hợp và trả focus về điểm gọi sau khi hộp thoại đóng.
- **FR-027**: Manager PHẢI hỗ trợ giao diện sáng, tối và theo lựa chọn hệ thống mà không làm mất khả năng đọc hoặc nhận biết trạng thái.
- **FR-028**: Khi chưa thể xác nhận trạng thái đăng nhập, Manager PHẢI hướng dẫn người dùng mở đúng runner để đăng nhập, không suy trạng thái đăng nhập chỉ từ việc trang đã tải xong.
- **FR-029**: Nghiệm thu PHẢI bao phủ chuỗi hai profile từ tạo, mở, đăng nhập, thử XPath, cảnh báo, xóa cảnh báo, shortcut, mở lặp, sửa đến xóa, đồng thời xác nhận các profile vẫn độc lập.
- **FR-030**: Nghiệm thu PHẢI bao phủ lỗi registry, lỗi ghi, lỗi mạng, runner crash, kết nối cũ, màn hình thay đổi và quyền upload, download, clipboard, microphone/camera mà không làm mất cấu hình.
- **FR-031**: Bản phát triển và bản phân phối PHẢI được kiểm tra riêng; báo cáo PHẢI ghi phiên bản, nguồn kiểm tra, thao tác, kết quả và bằng chứng theo từng môi trường desktop/backend thực tế.

### Thực thể chính

- **Profile**: Cấu hình của một website độc lập, gồm định danh bất biến, tên, địa chỉ, XPath, chu kỳ kiểm tra, icon, lựa chọn hành vi và liên kết đến dữ liệu phiên riêng.
- **Trạng thái runner**: Ảnh chụp trạng thái chạy, tải trang, lỗi, cảnh báo và phiên bản cấu hình đang được một runner sử dụng; có thể là chưa xác định khi không đủ bằng chứng.
- **Kết quả lưu profile**: Kết quả cho biết profile đã được tạo hoặc cập nhật, phần shortcut đã đồng bộ hay chưa và runner có cần mở lại hay không.
- **Kết quả thử XPath**: Kết quả tạm thời gắn với profile và tài liệu hiện hành, phân biệt khớp, không khớp cùng các nhóm lỗi mà không thay đổi trạng thái giám sát.
- **Icon được quản lý**: Ảnh cục bộ đã được chọn hoặc ảnh công khai đã được kiểm tra giới hạn, có icon dự phòng khi nguồn không dùng được.
- **Dữ liệu phiên**: Dữ liệu đăng nhập và duyệt web riêng của profile, được giữ khi xóa profile trừ khi người dùng xác nhận hành động xóa riêng.
- **Kết quả nghiệm thu**: Bằng chứng gắn với phiên bản và môi trường cụ thể, ghi trạng thái đạt, không đạt, có giới hạn hoặc chưa kiểm thử cho từng hành vi.

### Giới hạn phạm vi

- Bao gồm giao diện quản lý profile, tìm kiếm, trạng thái runner/cảnh báo, mở runner, xóa cảnh báo, thử XPath, icon, shortcut, xóa profile và xóa phiên có xác nhận.
- Bao gồm nghiệm thu chuỗi đầu cuối, bản phát triển, bản phân phối và tài liệu kết quả trên các môi trường Linux khả dụng.
- Không bao gồm xây lại cơ chế lưu profile, engine XPath, hệ thống cảnh báo, tray hoặc dịch vụ shortcut đã hoàn thành ở các phase trước; Phase 5 chỉ sử dụng và hoàn thiện các điểm nối cần thiết.
- Không bao gồm tích hợp trực tiếp với dịch vụ riêng của Zalo, cam kết website luôn tương thích hoặc cam kết phiên đăng nhập tồn tại vĩnh viễn.
- Không bao gồm tự động suy đoán người dùng đã đăng nhập chỉ vì trang tải xong.
- Không tuyên bố hỗ trợ một desktop/backend chưa có bằng chứng kiểm thử thực tế.

## Tiêu chí thành công *(bắt buộc)*

### Kết quả đo lường được

- **SC-001**: 100% yêu cầu P5-01 đến P5-12 trong tài liệu Phase 5 được ánh xạ tới ít nhất một kịch bản chấp nhận và một bằng chứng nghiệm thu.
- **SC-002**: Người dùng có thể hoàn thành chuỗi tạo profile, tìm kiếm, mở runner, xem trạng thái, sửa và lưu trong tối đa 3 phút mà không chỉnh tệp cấu hình hoặc dùng terminal.
- **SC-003**: Trong 10 lần mở liên tiếp cùng profile ở các trạng thái đang khởi động, thu nhỏ và ẩn, không lần nào tạo runner thứ hai.
- **SC-004**: Với hai profile hoạt động đồng thời, 100% thao tác focus, xóa cảnh báo, thử XPath, sửa và đóng runner chỉ thay đổi đúng profile được chọn.
- **SC-005**: 100% ca dữ liệu sai cấu trúc, registry hỏng, lỗi ghi và lỗi đồng bộ shortcut trong bộ nghiệm thu giữ được dữ liệu hợp lệ trước đó và nêu đúng phần thất bại.
- **SC-006**: 100% ca thử XPath chuẩn gồm khớp, không khớp, selector sai, dữ liệu sai, đang tải, điều hướng, đóng runner và timeout trả đúng nhóm kết quả mà không tạo cảnh báo hay đổi cấu hình.
- **SC-007**: 100% ca xóa khi runner còn chạy, chưa rõ trạng thái hoặc dừng quá hạn bị chặn; 100% ca xóa profile thành công giữ phiên cho đến khi người dùng xác nhận hành động xóa phiên riêng.
- **SC-008**: 100% icon hỏng, quá giới hạn, timeout, chuyển hướng không an toàn hoặc file bị mất trong bộ nghiệm thu dùng icon dự phòng và không làm profile mất khả dụng.
- **SC-009**: Người dùng chỉ dùng bàn phím có thể hoàn thành 100% thao tác chính gồm tìm kiếm, thêm, sửa, mở, thử XPath, bật shortcut, xóa cảnh báo và xác nhận/hủy xóa mà không bị kẹt focus.
- **SC-010**: Khi Manager đang hiển thị, 95% thay đổi trạng thái runner và cảnh báo xuất hiện trong vòng 5 giây; khi Manager bị ẩn hoặc đóng, hoạt động làm mới định kỳ dừng trong vòng 5 giây.
- **SC-011**: Chuỗi nghiệm thu đầu cuối với hai profile hoàn tất mà không trộn phiên, trạng thái hoặc cảnh báo; đóng và mở lại Manager không làm runner đang chạy bị gián đoạn.
- **SC-012**: Báo cáo Phase 5 ghi kết quả hoặc trạng thái chưa kiểm thử cho 100% tổ hợp KDE Plasma/GNOME và X11/Wayland được liệt kê, đồng thời phân biệt bằng chứng của bản phát triển và bản phân phối.

## Giả định

- Các nền tảng profile, runner, XPath, cảnh báo/tray và shortcut của Phase 1 đến Phase 4 đã tồn tại và là nguồn hành vi được tái sử dụng.
- Zalo Web là ca kiểm thử chính nhưng Manager quản lý profile website nói chung, không phụ thuộc dịch vụ tích hợp riêng của Zalo.
- Mỗi profile có dữ liệu phiên và vòng đời runner độc lập; một runner cho mỗi profile vẫn là quy tắc nền tảng.
- Xóa profile là thao tác thường dùng và giữ phiên mặc định; xóa phiên là thao tác hiếm, khó khôi phục nên luôn cần xác nhận riêng.
- Icon tải từ website là tài nguyên công khai, không cần cookie đăng nhập; nguồn không đạt giới hạn sẽ dùng icon dự phòng.
- Khả năng tray, notification, icon, pin và quyền thiết bị phụ thuộc desktop session; báo cáo chỉ xác nhận môi trường có thể kiểm thử trực tiếp.
- Người dùng có thể cần đăng nhập thủ công trong runner; Manager chỉ hướng dẫn và không tự suy đoán trạng thái đăng nhập khi thiếu tín hiệu đáng tin cậy.
- Tài liệu cài đặt của Phase 4 là điểm xuất phát cho nghiệm thu bản phân phối và được cập nhật ở giai đoạn triển khai nếu kết quả thực tế khác dự kiến.
