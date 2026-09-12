# Feature Specification: Desktop Attention, Notification và Tray

**Feature Branch**: `004-desktop-attention-tray`

**Created**: 2026-09-12

**Status**: Draft

**Input**: User description: "Đọc tài liệu trong docs và thực hiện Phase 3 trong docs/phased_implementation_plan.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nhận biết hoạt động mới khi runner ở nền (Priority: P1)

Là người dùng đang làm việc ở ứng dụng khác, tôi muốn runner của từng profile báo hiệu khi nội dung được theo dõi có thay đổi mới để không bỏ lỡ hoạt động quan trọng và vẫn biết chính xác profile nào cần chú ý.

**Why this priority**: Đây là giá trị chính của Phase 3: biến trạng thái quan sát đã có từ Phase 2 thành tín hiệu hữu ích trên desktop.

**Independent Test**: Mở hai profile, để cả hai ở nền, tạo thay đổi mới trên một profile và xác minh chỉ profile đó bật attention, cập nhật chỉ báo và tạo tối đa một popup phù hợp.

**Acceptance Scenarios**:

1. **Given** runner đang ở nền và chưa có attention, **When** trạng thái quan sát hợp lệ báo một thay đổi mới, **Then** runner bật attention và cập nhật badge/tray ngay cho đúng profile.
2. **Given** popup được bật và desktop hỗ trợ popup, **When** có nhiều thay đổi mới trong vòng 2 giây, **Then** người dùng nhận không quá một popup trong khoảng đó và popup phản ánh trạng thái hợp lệ mới nhất.
3. **Given** mode là `badge_count` và count giảm nhưng vẫn lớn hơn 0, **When** trạng thái mới được nhận, **Then** badge giảm theo count hiện tại mà không tạo popup mới.
4. **Given** profile A và B đều đang chạy, **When** profile A có thay đổi mới, **Then** attention và chỉ báo của profile B không thay đổi.
5. **Given** profile Zalo dùng mode `existence` với selector tương đương XPath của `div.leftbar-unread-badge`, **When** phần tử đó xuất hiện trong DOM, **Then** hệ thống coi đó là tin nhắn mới và bật attention.

---

### User Story 2 - Xóa cảnh báo mà không báo lại dữ liệu cũ (Priority: P1)

Là người dùng quay lại cửa sổ runner hoặc chủ động xóa cảnh báo, tôi muốn mọi dấu hiệu attention hiện tại biến mất nhưng mẫu quan sát vẫn được giữ để dữ liệu cũ không bị báo lại sau khi rời cửa sổ.

**Why this priority**: Nếu focus không xóa đúng trạng thái hoặc làm mất baseline, người dùng sẽ gặp cảnh báo lặp và không thể tin vào hệ thống.

**Independent Test**: Chạy chuỗi trạng thái `5 → focus → blur → 5 → 6` và xác minh giá trị 5 không báo lại, còn giá trị 6 tạo cảnh báo mới.

**Acceptance Scenarios**:

1. **Given** runner đang có attention, **When** cửa sổ nhận focus, **Then** flash, badge, dấu unread trên tray, popup đang hiện và popup đang chờ đều được xóa cho runner đó.
2. **Given** người dùng đã focus ở count 5 rồi chuyển sang cửa sổ khác, **When** trạng thái vẫn là 5, **Then** không có cảnh báo mới; **When** count tăng lên 6, **Then** cảnh báo mới được tạo.
3. **Given** cửa sổ đang focus, **When** trạng thái quan sát thay đổi, **Then** baseline tiếp tục cập nhật nhưng không bật attention hoặc popup; blur không tạo cảnh báo bù.
4. **Given** trạng thái có ý nghĩa trở về rỗng hoặc 0, **When** cập nhật được nhận, **Then** mọi attention hiện tại và popup đang chờ được xóa.
5. **Given** runner có attention, **When** người dùng chọn “Xóa cảnh báo” hoặc gửi lệnh điều khiển tương ứng, **Then** attention được xóa nhưng trạng thái đã đọc trên website không bị thay đổi.

---

### User Story 3 - Điều khiển runner từ tray và khôi phục an toàn (Priority: P2)

Là người dùng Linux, tôi muốn nhận biết trạng thái runner và thực hiện các thao tác thiết yếu từ tray, đồng thời luôn có cách mở lại cửa sổ nếu desktop không hiển thị tray.

**Why this priority**: Tray giúp thao tác nhanh nhưng mức hỗ trợ khác nhau giữa các desktop; khả năng khôi phục không được phụ thuộc duy nhất vào tray.

**Independent Test**: Bật chế độ thu nhỏ xuống tray, đóng cửa sổ, dùng từng mục menu để mở lại, xóa cảnh báo, mở Manager và thoát; sau đó lặp lại khi tray không khả dụng để xác minh cửa sổ không bị giấu ngoài khả năng khôi phục.

**Acceptance Scenarios**:

1. **Given** tray khả dụng, **When** attention thay đổi, **Then** icon thường và icon unread khác nhau rõ ràng, còn tooltip mô tả đúng mode và giá trị hiện tại.
2. **Given** cửa sổ đang ẩn hoặc thu nhỏ, **When** người dùng chọn “Mở cửa sổ” hoặc mở lại cùng profile qua CLI/Manager, **Then** đúng cửa sổ được khôi phục, hiển thị và yêu cầu focus.
3. **Given** `minimizeToTray` đang tắt, **When** người dùng đóng cửa sổ, **Then** runner thoát thay vì tiếp tục ẩn dưới tray.
4. **Given** `minimizeToTray` đang bật nhưng tray không tạo được, **When** người dùng đóng cửa sổ, **Then** cửa sổ không bị giấu và người dùng vẫn có đường khôi phục rõ ràng.
5. **Given** tray khả dụng, **When** người dùng chọn “Mở Manager”, **Then** Manager được mở hoặc khôi phục độc lập mà không làm dừng runner.

---

### User Story 4 - Thoát runner và bảo toàn trạng thái (Priority: P2)

Là người dùng muốn kết thúc một runner, tôi muốn thao tác Thoát luôn đóng thật, lưu trạng thái cần thiết và dọn các tài nguyên nền, kể cả khi chế độ thu nhỏ xuống tray đang bật.

**Why this priority**: Một runner không thoát được hoặc mất trạng thái cửa sổ gây tiến trình treo, tài nguyên sót và hành vi khó đoán ở lần mở sau.

**Independent Test**: Bật `minimizeToTray`, chọn “Thoát”, rồi xác minh runner kết thúc, trạng thái cửa sổ được giữ và không còn timer, popup hoặc tray thuộc runner đó.

**Acceptance Scenarios**:

1. **Given** `minimizeToTray` đang bật, **When** người dùng chọn “Thoát”, **Then** xử lý close-to-tray không ngăn runner kết thúc.
2. **Given** runner có popup hoặc timer đang chờ, **When** runner thoát, **Then** các tác vụ chờ và tài nguyên desktop được dọn mà không phát popup muộn.
3. **Given** cửa sổ có normal bounds hợp lệ trước khi thoát, **When** runner được mở lại, **Then** trạng thái cửa sổ được phục hồi trong giới hạn desktop hiện tại.

### Edge Cases

- Desktop báo thao tác attention/badge thành công nhưng không biểu diễn trực quan cho người dùng.
- Notification service không tồn tại, bị chính sách “không làm phiền” chặn hoặc từ chối hiển thị popup.
- Tray host không tồn tại, GNOME thiếu extension cần thiết hoặc tray được tạo nhưng icon không nhìn thấy.
- Count giảm trong lúc popup đang chờ; popup nếu còn đủ điều kiện phải dùng giá trị mới nhất thay vì count cũ.
- Cửa sổ nhận focus, trạng thái về 0/rỗng hoặc runner thoát đúng lúc popup cooldown sắp hết.
- Trạng thái XPath lỗi đến sau một trạng thái hợp lệ; lỗi không được biến thành cảnh báo hoạt động mới.
- Reload hoặc đổi document tạo baseline khởi tạo mới khi runner đang ở nền; trạng thái unread ban đầu có thể tạo attention theo quy tắc Phase 2.
- Hai profile thay đổi gần như đồng thời; timer, popup, badge và thao tác clear của mỗi profile vẫn độc lập.
- Icon profile bị thiếu hoặc không đọc được; người dùng vẫn thấy icon mặc định hợp lệ và phân biệt được trạng thái unread.
- Màn hình từng lưu vị trí cửa sổ đã bị ngắt kết nối hoặc compositor không cho phép khôi phục vị trí chính xác.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Mỗi runner MUST quản lý attention độc lập với trạng thái DOM và độc lập với mọi runner khác.
- **FR-002**: Khi runner không focus nhận một thay đổi mới hợp lệ từ cơ chế quan sát, hệ thống MUST bật attention và cập nhật các chỉ báo desktop đã bật cho đúng profile.
- **FR-003**: Khi runner đang focus, hệ thống MUST tiếp tục nhận baseline mới nhưng MUST NOT tạo attention hoặc popup cho thay đổi đó.
- **FR-004**: Focus hoặc thao tác “Xóa cảnh báo” MUST xóa flash, badge, dấu unread tray, popup do runner quản lý và popup đang chờ mà không reset baseline DOM hay thay đổi trạng thái đã đọc trên website.
- **FR-005**: Sau khi attention được xóa, hệ thống MUST chỉ cảnh báo lại khi có thay đổi mới theo quy tắc của mode; blur hoặc một trạng thái lặp lại MUST NOT tự tạo cảnh báo.
- **FR-006**: Với `badge_count`, count giảm MUST cập nhật badge hiện tại mà không tạo popup; count bằng 0 MUST xóa attention.
- **FR-007**: Với `existence` và `text_content`, trạng thái không còn giá trị có ý nghĩa MUST xóa attention.
- **FR-008**: Badge và tray MUST cập nhật ngay khi trạng thái hợp lệ thay đổi, không bị trì hoãn bởi cooldown popup.
- **FR-009**: Popup MUST có cooldown 2 giây cho mỗi runner, gộp các sự kiện trong thời gian chờ và chỉ giữ trạng thái hợp lệ mới nhất.
- **FR-010**: Khi cooldown kết thúc, popup MUST chỉ xuất hiện nếu runner vẫn ở nền, attention vẫn còn, popup vẫn được bật và môi trường còn hỗ trợ; focus, trạng thái rỗng/0 hoặc thoát MUST hủy popup đang chờ.
- **FR-011**: Nhấp vào popup MUST khôi phục, hiển thị và yêu cầu focus cho đúng cửa sổ runner.
- **FR-012**: Lỗi quan sát MUST giữ trạng thái hợp lệ gần nhất và MUST NOT tạo popup hoạt động mới.
- **FR-013**: Khi popup từ cơ chế XPath được bật, hệ thống MUST tránh để thông báo web của cùng website tạo nguồn popup trùng; khi popup XPath tắt, lựa chọn thông báo web hiện có của người dùng MUST được tôn trọng.
- **FR-014**: Tray MUST dùng hình ảnh khác nhau cho trạng thái thường và unread; nếu icon profile không dùng được, hệ thống MUST dùng icon mặc định hợp lệ.
- **FR-015**: Tooltip MUST hiển thị count cho `badge_count`; với `existence` hoặc `text_content`, tooltip MUST mô tả “Có thông báo mới” thay vì khẳng định một số lượng tin.
- **FR-016**: Menu tray MUST cung cấp “Mở cửa sổ”, “Xóa cảnh báo”, “Mở Manager” và “Thoát profile”, mỗi thao tác chỉ ảnh hưởng đúng đối tượng được mô tả.
- **FR-017**: `minimizeToTray` MUST mặc định tắt và chỉ được giấu cửa sổ khi người dùng đã bật tùy chọn, tray được tạo thành công và CLI hoặc Manager vẫn có thể khôi phục runner.
- **FR-018**: Nếu tray không khả dụng hoặc không chắc chắn nhìn thấy, hệ thống MUST không để người dùng mất đường khôi phục cửa sổ và MUST chỉ dẫn cách mở lại bằng CLI hoặc Manager.
- **FR-019**: Thao tác “Thoát profile” MUST bỏ qua hành vi close-to-tray, lưu trạng thái cửa sổ và dọn popup, timer, listener, kênh điều khiển và tray trước khi runner kết thúc.
- **FR-020**: Hệ thống MUST phân biệt việc gửi yêu cầu desktop thành công với việc người dùng thực sự nhìn thấy flash, badge, tray hoặc popup; kết quả nghiệm thu MUST ghi rõ giới hạn và fallback theo môi trường.
- **FR-021**: Trạng thái cửa sổ được lưu khi đóng hoặc ẩn MUST ưu tiên kích thước bình thường gần nhất, đưa cửa sổ về màn hình hiện có khi cần và chấp nhận giới hạn đặt vị trí của desktop.
- **FR-022**: Profile fixture `zalo` MUST mặc định theo dõi sự tồn tại của phần tử CSS `div.leftbar-unread-badge` bằng một biểu thức XPath tương đương ở mode `existence`; phần tử tồn tại MUST được coi là tin nhắn mới.

### Key Entities

- **Observed State**: Trạng thái hợp lệ mới nhất từ Phase 2, gồm mode và giá trị có ý nghĩa dùng để quyết định thay đổi mới, giảm hoặc trở về rỗng.
- **Attention State**: Trạng thái riêng của một profile cho biết runner có cần chú ý hay không, chỉ báo hiện tại và sự kiện mới nhất đang chờ popup.
- **Desktop Integration Preferences**: Lựa chọn theo profile cho flash, badge, popup và thu nhỏ xuống tray; `minimizeToTray` mặc định tắt.
- **Desktop Capability Result**: Bằng chứng theo môi trường về khả năng hiển thị attention, badge, tray và popup, kèm giới hạn hoặc fallback quan sát được.

### Scope Boundaries

- Bao gồm chuyển trạng thái XPath đã có thành attention, flash, badge, tray, popup; clear khi focus; khôi phục cửa sổ và vòng đời thoát an toàn.
- Bao gồm lệnh xóa attention trên kênh điều khiển runner đã có và mở Manager từ menu tray.
- Không bao gồm tạo desktop shortcut/launcher tự động hoặc xử lý pin menu; các phần này thuộc Phase 4.
- Không bao gồm Dashboard quản lý profile hay form cấu hình hoàn chỉnh; các phần này thuộc Phase 5.
- Không cam kết mọi tính năng desktop hiển thị giống nhau trên KDE/GNOME hoặc X11/Wayland; chỉ công nhận kết quả đã được quan sát trên môi trường ghi rõ.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Trong 100% kịch bản kiểm thử có hai profile, thay đổi của một profile không làm thay đổi attention, badge, tray hoặc popup của profile còn lại.
- **SC-002**: Trong chuỗi `5 → focus → blur → 5 → 6`, hệ thống không cảnh báo lại ở giá trị 5 và tạo đúng một attention mới ở giá trị 6.
- **SC-003**: Với mọi nhóm sự kiện diễn ra trong một cửa sổ 2 giây, badge/tray phản ánh trạng thái mới nhất ngay trong lần cập nhật tương ứng và không có quá một popup được tạo trong cửa sổ đó.
- **SC-004**: Focus, clear-attention hoặc trạng thái 0/rỗng hủy 100% popup đang chờ và xóa mọi chỉ báo attention của đúng profile.
- **SC-005**: Người dùng có thể khôi phục một runner đã thu nhỏ hoặc ẩn bằng ít nhất một đường không phụ thuộc vào tray trong mọi cấu hình được hỗ trợ.
- **SC-006**: Trong 100% lần chọn “Thoát profile” khi close-to-tray đang bật, runner vẫn kết thúc sạch và không còn popup hoặc tác vụ attention phát sinh sau khi thoát.
- **SC-007**: Báo cáo nghiệm thu ghi kết quả quan sát riêng cho KDE Plasma/X11, KDE Plasma/Wayland và các môi trường GNOME sẵn có, đồng thời ghi notification service, tray/dock extension và chế độ không làm phiền có ảnh hưởng.
- **SC-008**: Mọi chức năng desktop không khả dụng đều có fallback hoặc hướng dẫn khôi phục rõ ràng; không có kịch bản được đánh dấu đạt chỉ dựa trên giá trị trả về của hệ thống mà thiếu quan sát người dùng.

## Assumptions

- Phase 1 đã cung cấp runner riêng theo profile, vòng đời cửa sổ, lưu window state, kênh điều khiển và desktop identity fixture.
- Phase 2 đã cung cấp trạng thái XPath hợp lệ, baseline theo mode và tín hiệu xác định thay đổi mới; Phase 3 không thay đổi quy tắc so sánh DOM.
- Mỗi runner là một tiến trình/profile độc lập nên attention và cooldown được cô lập tự nhiên theo profile.
- Cấu hình hiện tại đã có các lựa chọn desktop integration cần thiết; GUI chỉnh sửa đầy đủ các lựa chọn này được hoãn tới Phase 5.
- Desktop Linux có thể giới hạn hoặc ẩn flash, badge, tray và popup theo compositor, shell, extension, notification service hoặc chính sách không làm phiền.
- Desktop entry fixture từ Phase 1 được dùng để kiểm tra badge cho tới khi generator chính thức được hoàn thành ở Phase 4.
- Selector Zalo được cung cấp dưới dạng CSS trong yêu cầu người dùng; vì Phase 2 đánh giá XPath, runtime dùng biểu thức XPath tương đương kiểm tra token class `leftbar-unread-badge`.
