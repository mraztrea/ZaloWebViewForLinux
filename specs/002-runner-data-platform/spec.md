# Feature Specification: Nền tảng Runner và Quản lý Dữ liệu Phiên (Runner & Data Platform)

**Feature Branch**: `002-runner-data-platform`

**Created**: 2026-09-12

**Status**: Draft

**Input**: User description: "Đọc tài liệu trong docs và thực hiện phase 1 trong tài liệu docs/phased_implementation_plan.md"

## Overview

Tính năng này hiện thực hóa **Phase 1: Runner, dữ liệu và nền tảng Linux** trong lộ trình kiến trúc của hệ thống quản lý webview trên Linux. Mục tiêu trọng tâm là cung cấp khả năng khởi chạy các website dưới dạng ứng dụng cửa sổ native độc lập (không thanh địa chỉ, không menu trình duyệt), quản lý cấu hình các profile an toàn với cơ chế bảo toàn dữ liệu, duy trì phiên đăng nhập và bộ nhớ tách biệt cho từng tài khoản, đồng thời thiết lập cơ chế khóa đơn phiên (single-instance) và kiểm soát vòng đời tiến trình chuẩn xác trên môi trường Linux.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quản lý cấu hình Profile và bảo toàn dữ liệu (Priority: P1)

Là một người dùng hoặc người quản trị hệ thống, tôi muốn cấu hình của các profile website được lưu trữ có cấu trúc, kiểm tra tính hợp lệ nghiêm ngặt và ghi dữ liệu an toàn, để đảm bảo thông tin tài khoản không bao giờ bị mất mát hoặc hư hại ngay cả khi có sự cố bất ngờ.

**Why this priority**: Cấu hình và dữ liệu profile là xương sống của toàn bộ hệ thống. Nếu dữ liệu cấu hình bị mất, hỏng hoặc ghi đè ngoài ý muốn, người dùng sẽ mất toàn bộ danh sách tài khoản và liên kết phiên.

**Independent Test**: Có thể kiểm thử độc lập bằng cách tạo, đọc, sửa đổi các cấu hình profile; thử nghiệm ghi đồng thời, thử nghiệm sửa file cấu hình bằng cú pháp JSON lỗi để xác minh hệ thống giữ nguyên file gốc và báo lỗi rõ ràng mà không ghi đè dữ liệu rỗng.

**Acceptance Scenarios**:

1. **Given** danh sách cấu hình rỗng, **When** người dùng hoặc hệ thống tạo mới một profile với tên hợp lệ và URL website chuẩn bảo mật (HTTP/HTTPS), **Then** hệ thống tự động sinh định danh (ID) an toàn, duy nhất, lưu trữ đầy đủ các thuộc tính và gán mốc thời gian tạo/cập nhật.
2. **Given** một tệp cấu hình profile hiện có bị sửa lỗi cú pháp (malformed JSON), **When** hệ thống khởi động và cố gắng đọc cấu hình, **Then** hệ thống từ chối nạp, đưa ra thông báo lỗi chi tiết có thể hành động và tuyệt đối bảo toàn tệp gốc, không ghi đè danh sách rỗng.
3. **Given** một runner của profile đang hoạt động, **When** cấu hình của profile đó được cập nhật từ bên ngoài và sau đó cửa sổ runner đóng lại, **Then** các thay đổi cấu hình mới nhất không bị snapshot cũ của runner ghi đè, và runner chỉ ghi nhận dữ liệu trạng thái hiển thị cửa sổ riêng biệt.
4. **Given** tên profile bằng tiếng Việt có dấu hoặc chứa khoảng trắng/ký tự đặc biệt, **When** hệ thống sinh định danh cho profile, **Then** định danh được tạo dưới dạng chuỗi an toàn không dấu, duy nhất và ngăn ngừa hoàn toàn nguy cơ tấn công duyệt thư mục (path traversal).

---

### User Story 2 - Khởi chạy Runner độc lập và cách ly phiên duyệt web (Priority: P1)

Là một người dùng sở hữu nhiều tài khoản trên cùng một dịch vụ web (ví dụ nhiều tài khoản Zalo), tôi muốn mở từng tài khoản trong một cửa sổ ứng dụng native riêng biệt từ dòng lệnh hoặc launcher, để làm việc đồng thời trên nhiều tài khoản mà không bị trộn lẫn dữ liệu hay đăng xuất chéo.

**Why this priority**: Đây là giá trị cốt lõi của ứng dụng. Khả năng mở nhiều tài khoản song song và giữ phiên đăng nhập độc lập giúp người dùng vượt qua rào cản chỉ đăng nhập được 1 tài khoản trên trình duyệt thông thường.

**Independent Test**: Khởi chạy hai profile khác nhau bằng dòng lệnh (`--profile profile-a` và `--profile profile-b`). Đăng nhập hai tài khoản khác nhau trên hai cửa sổ, sau đó đóng cửa sổ và mở lại để xác nhận phiên đăng nhập của từng tài khoản vẫn được duy trì nguyên vẹn.

**Acceptance Scenarios**:

1. **Given** một profile hợp lệ đã được cấu hình, **When** người dùng gọi lệnh khởi chạy kèm định danh profile, **Then** ứng dụng mở một cửa sổ native độc lập tải đúng địa chỉ URL của profile đó, không có thanh nhập URL hay thanh công cụ trình duyệt thừa thãi.
2. **Given** hai profile A và B được mở cùng lúc, **When** người dùng thao tác đăng nhập và lưu dữ liệu trên cửa sổ A, **Then** cửa sổ B không bị ảnh hưởng, toàn bộ cookie, bộ nhớ lưu trữ cục bộ và bộ nhớ tạm được lưu vào hai không gian lưu trữ tách biệt hoàn toàn.
3. **Given** người dùng đã đăng nhập thành công vào một tài khoản trên profile, **When** người dùng đóng cửa sổ runner và mở lại profile đó sau đó, **Then** trạng thái phiên làm việc vẫn được duy trì mà không bắt buộc phải đăng nhập lại từ đầu (miễn là dịch vụ web chưa thu hồi phiên).

---

### User Story 3 - Khóa đơn phiên theo Profile và khôi phục trạng thái cửa sổ (Priority: P2)

Là một người dùng máy tính để bàn Linux, tôi muốn mỗi profile chỉ chạy một cửa sổ duy nhất và tự động khôi phục đúng kích thước/vị trí hiển thị trước đó, để tránh việc mở nhiều cửa sổ trùng lặp gây tốn tài nguyên và mất tập trung.

**Why this priority**: Ngăn ngừa tình trạng mở trùng lặp phiên (gây xung đột dữ liệu ghi đĩa) và mang lại trải nghiệm người dùng liền mạch tương tự như các ứng dụng desktop chuyên nghiệp.

**Independent Test**: Mở profile A, sau đó thực hiện lệnh mở lại profile A từ terminal khi cửa sổ đang mở, đang thu nhỏ (minimized) hoặc đang ẩn. Xác nhận không có cửa sổ mới nào được sinh ra, cửa sổ hiện tại được đưa lên tiêu điểm (focus), và vị trí/kích thước cửa sổ được khôi phục chính xác.

**Acceptance Scenarios**:

1. **Given** profile A đang chạy và hiển thị trên màn hình, **When** người dùng gọi lệnh mở lại profile A, **Then** hệ thống không tạo tiến trình cửa sổ mới, mà kích hoạt cửa sổ hiện tại lên trên cùng và nhận tiêu điểm thao tác.
2. **Given** cửa sổ của profile A đang bị thu nhỏ (minimized) xuống thanh tác vụ, **When** nhận được yêu cầu khởi chạy lần hai cho profile A, **Then** cửa sổ được tự động phục hồi kích thước bình thường và hiển thị lên trước mặt người dùng.
3. **Given** người dùng di chuyển, thay đổi kích thước hoặc phóng to tối đa (maximized) cửa sổ runner rồi đóng lại, **When** khởi chạy lại profile đó, **Then** cửa sổ xuất hiện đúng tọa độ, kích thước chuẩn hoặc trạng thái phóng to trước đó, với tọa độ được giới hạn an toàn trong phạm vi màn hình khả dụng.
4. **Given** profile A đang chạy, **When** người dùng khởi chạy profile B, **Then** profile B khởi động bình thường trong không gian riêng mà không bị khóa phiên của profile A ngăn cản.

---

### User Story 4 - Kiểm soát quyền truy cập phần cứng và an toàn điều hướng (Priority: P3)

Là một người dùng quan tâm đến bảo mật và quyền riêng tư, tôi muốn kiểm soát các quyền truy cập nhạy cảm (microphone, camera) và được bảo vệ trước các liên kết độc hại hoặc chuyển hướng không an toàn từ trang web.

**Why this priority**: Bảo vệ thiết bị người dùng khỏi việc lạm dụng camera/mic từ nội dung web không đáng tin cậy, đồng thời đảm bảo việc từ chối quyền không làm tê liệt toàn bộ ứng dụng.

**Independent Test**: Mở một profile web có tính năng gọi video/thoại; xác nhận hộp thoại xin quyền xuất hiện theo đúng nguồn gốc (origin). Thực hiện từ chối quyền và kiểm tra các tính năng nhắn tin văn bản vẫn hoạt động bình thường.

**Acceptance Scenarios**:

1. **Given** trang web bên trong runner yêu cầu quyền sử dụng microphone hoặc camera, **When** yêu cầu phát sinh, **Then** hệ thống kiểm tra chính sách nguồn gốc (origin) và chỉ cấp quyền khi có sự đồng ý tường minh từ người dùng cho đúng nguồn gốc đó.
2. **Given** người dùng từ chối cấp quyền microphone/camera cho trang web, **When** quay lại giao diện web, **Then** ứng dụng thông báo rõ ràng trạng thái bị từ chối và cho phép người dùng tiếp tục sử dụng các chức năng không yêu cầu thiết bị (nhắn tin, gửi file).
3. **Given** trang web chứa liên kết điều hướng tới một trang bên ngoài hoặc giao thức không an toàn, **When** người dùng nhấp vào liên kết, **Then** hệ thống ngăn chặn việc chiếm quyền cửa sổ nội bộ và xử lý mở liên kết an toàn qua trình duyệt mặc định của hệ điều hành.

---

### User Story 5 - Điều khiển vòng đời và kênh trạng thái tiến trình (Priority: P3)

Là một tiến trình quản lý hoặc công cụ giám sát hệ thống, tôi muốn có thể truy vấn trạng thái hoạt động (đang tải, bình thường, lỗi) và gửi tín hiệu tắt an toàn tới runner của từng profile, để quản lý tiến trình một cách tập trung và tin cậy.

**Why this priority**: Cho phép Dashboard Manager (trong Phase 5) và các công cụ dòng lệnh giao tiếp, kiểm tra trạng thái sống của runner và đóng ứng dụng gọn gàng mà không để lại tiến trình mồ côi (zombie processes) hay tài nguyên bị khóa.

**Independent Test**: Kết nối vào kênh điều khiển cục bộ của runner đang chạy, gửi yêu cầu truy vấn trạng thái để nhận về thông tin trạng thái; gửi yêu cầu tắt an toàn và xác nhận runner đóng tuần tự, giải phóng khóa và dọn sạch kênh giao tiếp.

**Acceptance Scenarios**:

1. **Given** runner của profile A đang hoạt động, **When** một tiến trình được cấp quyền gửi yêu cầu kiểm tra trạng thái qua kênh điều khiển cục bộ, **Then** runner phản hồi định dạng dữ liệu chuẩn xác nhận trạng thái hiện tại (đang chạy, phiên bản cấu hình).
2. **Given** runner nhận được yêu cầu tắt an toàn từ kênh điều khiển, **When** xử lý lệnh tắt, **Then** runner tiến hành lưu lại trạng thái cửa sổ, ngắt các kết nối, giải phóng khóa đơn phiên, xóa tệp kênh giao tiếp và kết thúc tiến trình sạch sẽ.
3. **Given** một tệp kênh giao tiếp cũ còn sót lại từ lần tắt bất thường trước đó (stale file), **When** runner mới của profile đó khởi động sau khi đã giành được khóa phiên hợp lệ, **Then** runner tự động phát hiện, thu dọn tệp cũ và tái lập kênh mới mà không bị gián đoạn.

---

## Edge Cases

- **Tệp cấu hình bị lỗi cú pháp hoặc bị cắt cụt (truncated JSON)**: Hệ thống phải báo lỗi rõ ràng ra màn hình console/log, giữ nguyên nội dung tệp hỏng để người dùng có thể sao lưu sửa chữa, không tự ý tạo lại tệp trắng.
- **Định danh profile không hợp lệ**: Đầu vào CLI chứa ký tự nguy hiểm (`../`, khoảng trắng, ký tự điều khiển hệ thống) bị từ chối ngay lập tức trước khi thực hiện bất kỳ thao tác truy cập tệp nào.
- **Khởi chạy lại khi runner đang trong tiến trình khởi động (startup race condition)**: Phiên thứ hai phát hiện cờ khóa phiên, kiên nhẫn chờ cửa sổ của phiên thứ nhất sẵn sàng để đưa lên tiêu điểm thay vì báo lỗi thất bại đột ngột.
- **Thay đổi cấu hình màn hình hiển thị**: Khi cửa sổ được cấu hình hiển thị ở tọa độ của một màn hình phụ đã bị ngắt kết nối, hệ thống tự động đưa tọa độ cửa sổ về vùng hiển thị của màn hình chính hiện có.
- **Lỗi tải trang hoặc mất kết nối mạng**: Khi trang web không thể tải do đứt mạng hoặc lỗi máy chủ, runner hiển thị thông báo lỗi thân thiện kèm nút thử lại, không để màn hình trắng vô nghĩa và không làm crash tiến trình.
- **Giao tiếp kênh điều khiển gửi dữ liệu vượt kích thước hoặc sai cấu trúc**: Runner từ chối các gói tin vượt ngưỡng giới hạn kích thước (trên 64 KiB) hoặc sai lược đồ dữ liệu, đồng thời duy trì hoạt động bình thường của cửa sổ mà không bị treo.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI lưu trữ danh sách profile trong thư mục cấu hình chuẩn của người dùng (`XDG_CONFIG_HOME/zaloview/profiles.json`), tuân thủ phiên bản lược đồ (schema version) và kiểm tra tính hợp lệ của mọi trường dữ liệu trước khi sử dụng.
- **FR-002**: Hệ thống PHẢI thực hiện ghi tệp cấu hình theo cơ chế nguyên tử (atomic write thông qua tệp tạm rồi đổi tên) và thiết lập quyền truy cập tệp riêng tư chỉ cho người dùng hiện tại (chế độ 0600 cho tệp, 0700 cho thư mục).
- **FR-003**: Runner PHẢI hoạt động ở chế độ chỉ đọc đối với tệp cấu hình chung của toàn bộ ứng dụng và chỉ ghi dữ liệu trạng thái cửa sổ vào tệp riêng trong thư mục dữ liệu của chính profile đó (`window-state.json`).
- **FR-004**: Bộ phân tích dòng lệnh PHẢI hỗ trợ các chế độ khởi chạy độc lập: `--manager` để mở giao diện quản lý và `--profile <id>` để mở runner tương ứng; các tham số lạ hoặc xung đột PHẢI kết thúc tiến trình với mã lỗi khác 0 và hướng dẫn trợ giúp.
- **FR-005**: Mỗi profile PHẢI sở hữu một không gian lưu trữ dữ liệu người dùng (userData) và phân vùng phiên duyệt web (session partition) riêng biệt, đảm bảo các tài khoản hoạt động song song không can thiệp lẫn nhau.
- **FR-006**: Hệ thống PHẢI áp dụng cơ chế khóa đơn phiên (single-instance lock) riêng biệt theo từng profile, ngăn chặn việc tạo nhiều cửa sổ cho cùng một profile và tự động kích hoạt/phục hồi cửa sổ hiện có khi nhận yêu cầu mở lần hai.
- **FR-007**: Cửa sổ runner PHẢI là cửa sổ native tiêu chuẩn với khung điều khiển của hệ điều hành, không chứa thanh địa chỉ URL hay thanh menu điều hướng của trình duyệt web thông thường.
- **FR-008**: Hệ thống PHẢI áp dụng chính sách bảo mật cô lập nội dung web: bật cách ly ngữ cảnh (context isolation), tắt tích hợp hệ thống trong trang web (disable node integration), kích hoạt môi trường hộp cát (sandbox) và bảo vệ kết nối an toàn (web security).
- **FR-009**: Hệ thống PHẢI kiểm soát quyền truy cập phần cứng (camera, microphone) theo từng nguồn gốc (origin); mặc định từ chối và chỉ cấp phép khi có xác nhận rõ ràng từ người dùng.
- **FR-010**: Cửa sổ runner PHẢI tự động ghi nhận kích thước và vị trí bình thường (normal bounds) định kỳ và khi đóng/ẩn, đồng thời khôi phục chính xác trạng thái phóng to tối đa (maximized) nếu trước đó cửa sổ ở trạng thái này.
- **FR-011**: Mỗi runner PHẢI duy trì một kênh giao tiếp điều khiển cục bộ (local Unix domain socket) trong thư mục thời gian chạy của người dùng với quyền truy cập bảo mật, hỗ trợ các lệnh kiểm tra trạng thái (`status`) và tắt ứng dụng an toàn (`shutdown`).
- **FR-012**: Kênh giao tiếp điều khiển PHẢI có cơ chế định danh yêu cầu (request ID), giới hạn dung lượng thông điệp tối đa 64 KiB, kiểm soát thời gian chờ (timeout) và tự động dọn dẹp các tệp kênh cũ không còn hoạt động.
- **FR-013**: Runner PHẢI thiết lập định danh ứng dụng cho hệ thống hiển thị Linux (X11 / Wayland) tương thích với định danh desktop entry theo quy chuẩn `zaloview-<id>`.

---

### Key Entities

- **Profile**: Thực thể đại diện cho cấu hình một tài khoản website độc lập, bao gồm các thông tin:
  - `id`: Định danh bất biến, duy nhất dạng slug (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`), tối đa 64 ký tự.
  - `name`: Tên hiển thị người dùng đặt, từ 1 đến 120 ký tự.
  - `url`: Địa chỉ trang web hợp lệ bắt đầu bằng giao thức HTTP hoặc HTTPS, không chứa thông tin đăng nhập trong URL.
  - `iconPath`: Đường dẫn tùy chọn tới tệp biểu tượng đã được chuẩn hóa.
  - `userAgent`: Chuỗi nhận diện trình duyệt tùy biến (nếu có).
  - `xpathConfig`: Cấu hình bộ theo dõi nội dung DOM (chế độ, khoảng thời gian quét, bộ chọn).
  - `desktopConfig`: Các tùy chọn tích hợp môi trường desktop (thông báo, phím tắt, khay hệ thống).
  - `createdAt`, `updatedAt`: Mốc thời gian ISO ghi nhận lịch sử tạo và cập nhật.
- **ProfileRegistry**: Tập hợp danh sách các Profile kèm thuộc tính phiên bản định dạng `schemaVersion: 1`.
- **WindowState**: Trạng thái không gian của cửa sổ ứng dụng, gồm tọa độ `x`, `y`, kích thước `width`, `height` và cờ trạng thái phóng to `isMaximized`.
- **PermissionRecord**: Bản ghi quyết định người dùng đối với các quyền truy cập nhạy cảm (camera, microphone, v.v.) được lưu theo từng cặp nguồn gốc (origin) và loại quyền.
- **RunnerControlMessage**: Cấu trúc dữ liệu trao đổi qua kênh điều khiển cục bộ, gồm mã định danh yêu cầu `requestId`, tên lệnh `action` (`status`, `shutdown`), tham số và kết quả phản hồi.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% các profile khác nhau chạy đồng thời duy trì không gian lưu trữ và phiên làm việc độc lập hoàn toàn; đăng nhập tài khoản trên profile này tuyệt đối không ghi đè hoặc ảnh hưởng tới phiên làm việc của profile kia.
- **SC-002**: Khi gửi lệnh mở lại một profile đang hoạt động (kể cả khi đang bị thu nhỏ), 100% trường hợp cửa sổ hiện hữu được khôi phục và đưa lên tiêu điểm trong vòng dưới 1.0 giây mà không tạo thêm cửa sổ trùng lặp.
- **SC-003**: Khi tệp cấu hình JSON bị hỏng cú pháp, 100% nội dung tệp gốc được bảo toàn nguyên vẹn mà không bị hệ thống xóa hoặc ghi đè dữ liệu rỗng.
- **SC-004**: Sau khi đóng và khởi động lại, 100% cửa sổ runner khôi phục đúng kích thước hiển thị và trạng thái phóng to (maximized) trước đó trong phạm vi hiển thị của màn hình hiện có.
- **SC-005**: 100% yêu cầu truy cập thiết bị nhạy cảm (camera, microphone) được kiểm soát theo nguồn gốc (origin); việc người dùng từ chối cấp quyền không làm phát sinh lỗi đóng ứng dụng ngoài ý muốn.
- **SC-006**: Thời gian khởi động cửa sổ native của một profile từ lệnh dòng lệnh đạt dưới 3.0 giây trên cấu hình phần cứng tiêu chuẩn.
- **SC-007**: Runner giải phóng 100% tài nguyên khóa phiên và tệp kênh giao tiếp cục bộ trong vòng dưới 1.5 giây sau khi nhận lệnh tắt an toàn.

---

## Assumptions

- **Môi trường đồ họa Linux**: Ứng dụng chạy trên hệ điều hành Linux có cài đặt môi trường đồ họa máy tính để bàn (hỗ trợ máy chủ hiển thị X11 hoặc Wayland).
- **Tuân thủ chuẩn XDG**: Hệ điều hành tuân thủ các quy chuẩn thư mục cơ bản của FreeDesktop (XDG Base Directory Specification), cho phép truy cập đọc/ghi các thư mục cấu hình và dữ liệu của người dùng.
- **Khả năng tương thích của dịch vụ web**: Dịch vụ web mục tiêu (ví dụ Zalo Web) hỗ trợ hoạt động trên các nhân trình duyệt hiện đại và duy trì phiên đăng nhập thông qua các cơ chế lưu trữ web tiêu chuẩn.
- **Phân tách phạm vi theo Phase**: Các tính năng theo dõi biến động DOM nâng cao (XPath Observer - Phase 2), hệ thống thông báo đa tầng desktop (Phase 3), tự động sinh shortcut menu ứng dụng (Phase 4), và giao diện đồ họa Manager hoàn chỉnh (Phase 5) sẽ được thực hiện tuần tự trong các phase kế tiếp theo đúng lộ trình.
