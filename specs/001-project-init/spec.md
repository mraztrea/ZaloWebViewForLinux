# Feature Specification: Khởi tạo dự án và Nền tảng phát triển (Project Initialization & Foundation)

**Feature Branch**: `001-project-init`

**Created**: 2026-09-12

**Status**: Draft

**Input**: User description: "Khởi tạo dự án. Đọc tài liệu trong docs, khởi tạo dự án, cài đặt các dependent cần thiết"

## Overview

Thiết lập nền tảng dự án ban đầu cho ứng dụng quản lý webview trên Linux (Linux Webview Manager), bao gồm cấu trúc dự án, quản lý gói phụ thuộc bị khóa phiên bản, quy trình biên dịch tự động đa mục tiêu (tách biệt môi trường main, preload sandbox và renderer), công cụ kiểm tra chất lượng mã nguồn (typecheck, unit test), và script launcher dòng lệnh có thể thực thi từ mọi thư mục làm việc.

Tính năng này đảm bảo bất kỳ nhà phát triển nào clone kho mã nguồn mới đều có thể cài đặt, biên dịch, kiểm thử và chạy ứng dụng mà không gặp lỗi cấu hình môi trường hoặc vi phạm ranh giới bảo mật.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Khởi tạo môi trường từ bản sao chép sạch (Priority: P1)

Là một nhà phát triển phần mềm, tôi muốn clone kho mã nguồn và cài đặt toàn bộ các gói phụ thuộc cần thiết bằng một lệnh chuẩn hóa duy nhất, để sẵn sàng phát triển và kiểm thử mà không phải cấu hình thủ công phức tạp.

**Why this priority**: Đây là điều kiện tiên quyết bắt buộc. Không có môi trường phụ thuộc và cấu trúc build chuẩn, không thể triển khai bất kỳ tính năng nào tiếp theo.

**Independent Test**: Có thể kiểm thử độc lập từ một thư mục clone mới bằng lệnh cài đặt gói, xác nhận tất cả phụ thuộc khớp chính xác với bản khóa phiên bản mà không có cảnh báo xung đột hay thiếu gói.

**Acceptance Scenarios**:

1. **Given** một checkout sạch của kho mã nguồn trên hệ điều hành Linux, **When** nhà phát triển thực hiện lệnh cài đặt gói phụ thuộc, **Then** toàn bộ phụ thuộc cần thiết được tải về và xác thực khớp với file khóa phiên bản (lockfile), kết thúc thành công với mã thoát 0.
2. **Given** môi trường đã cài đặt phụ thuộc đầy đủ, **When** chạy lệnh kiểm tra tính hợp lệ của kiểu dữ liệu (typecheck) và bộ kiểm thử tự động (test), **Then** hệ thống thực thi kiểm tra thành công và không phát sinh lỗi biên dịch hay cảnh báo kiểu.

---

### User Story 2 - Khởi chạy ứng dụng qua công cụ dòng lệnh độc lập (Priority: P1)

Là một người dùng hoặc nhà phát triển, tôi muốn có một script launcher trong thư mục `bin` có thể gọi từ bất kỳ thư mục làm việc nào (cwd) và truyền tham số dòng lệnh chính xác tới ứng dụng, để khởi động chế độ quản lý hoặc chế độ profile tương ứng.

**Why this priority**: Cơ chế launcher là nền tảng để desktop shortcut, terminal và các ứng dụng khác kích hoạt đúng profile sau này. Nếu launcher phụ thuộc vào cwd hiện tại, các shortcut hệ thống Linux sẽ bị hỏng khi chạy ngoài thư mục dự án.

**Independent Test**: Thực thi launcher từ một thư mục bất kỳ bên ngoài repo (ví dụ `/tmp` hoặc thư mục home) kèm tham số `--profile test-profile` hoặc `--manager`, xác minh tiến trình nhận diện đúng tham số và xử lý phù hợp.

**Acceptance Scenarios**:

1. **Given** script launcher đã được cấp quyền thực thi, **When** người dùng gọi launcher từ một thư mục làm việc khác với thư mục gốc của dự án, **Then** launcher tự động xác định được đường dẫn gốc của ứng dụng và khởi chạy tiến trình ứng dụng thành công.
2. **Given** người dùng truyền các tham số dòng lệnh hợp lệ (ví dụ `--manager` hoặc `--profile <id>`), **When** launcher kích hoạt ứng dụng, **Then** các tham số được chuyển tiếp nguyên vẹn tới bộ phân tích tham số dòng lệnh mà không bị ghi đè hoặc cố định mặc định.
3. **Given** người dùng truyền tham số dòng lệnh không hợp lệ hoặc thiếu tham số bắt buộc, **When** ứng dụng khởi động, **Then** hệ thống hiển thị thông báo lỗi rõ ràng và kết thúc với mã thoát khác 0.

---

### User Story 3 - Quy trình đóng gói an toàn theo ranh giới bảo mật (Priority: P2)

Là một kiến trúc sư hệ thống, tôi muốn quy trình biên dịch tự động tạo ra các gói mã nguồn phân tách rõ ràng cho từng môi trường (main, preload, renderer), để tuân thủ nguyên tắc cách ly bảo mật (sandbox) mà không gây lỗi thực thi tại runtime.

**Why this priority**: Ứng dụng tải các website bên ngoài, do đó bảo mật sandbox là bắt buộc. Nếu quy trình đóng gói bundle sai cách (ví dụ vô tình để lộ biến môi trường cấp hệ thống vào giao diện hoặc làm hỏng cơ chế import của preload), tính toàn vẹn bảo mật của ứng dụng sẽ bị phá vỡ.

**Independent Test**: Chạy quy trình đóng gói, sau đó kiểm tra tệp bundle được tạo ra: preload không bị lỗi thiếu module, renderer không chứa tham chiếu tới các API hệ thống đặc quyền, và tài nguyên tĩnh (HTML/CSS) được sao chép đầy đủ vào thư mục phân phối.

**Acceptance Scenarios**:

1. **Given** mã nguồn của main, preload và renderer, **When** chạy lệnh biên dịch dự án, **Then** hệ thống tạo ra các tệp phân phối riêng biệt trong thư mục đích, tài nguyên tĩnh được sao chép nguyên vẹn, và không nuốt lỗi biên dịch.
2. **Given** các tệp phân phối đã được biên dịch, **When** môi trường giao diện được nạp trong chế độ sandbox, **Then** không xuất hiện lỗi tham chiếu module hệ thống (`exports is not defined` hoặc lỗi require).

---

### Edge Cases

- **Đường dẫn thư mục làm việc chứa khoảng trắng hoặc ký tự đặc biệt**: Launcher vẫn phải phân giải đúng đường dẫn gốc và chạy ứng dụng mà không bị lỗi tách chuỗi đường dẫn.
- **Thực thi khi chưa chạy lệnh biên dịch**: Khi người dùng chạy lệnh khởi động phát triển, hệ thống tự động chạy biên dịch trước (prestart) để đảm bảo tệp thực thi luôn mới nhất.
- **Tiến trình khởi chạy thất bại do thiếu runtime hoặc lỗi hệ điều hành**: Launcher bắt lỗi thoát (exit code / signal) và truyền mã lỗi thực tế ra terminal, không tự động biến thất bại thành mã 0.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI cung cấp tệp định nghĩa dự án (`package.json`) và tệp khóa phụ thuộc chính xác (`package-lock.json`), chỉ định rõ phiên bản runtime được hỗ trợ trên Linux.
- **FR-002**: Hệ thống PHẢI cấu hình trình kiểm tra kiểu tĩnh (TypeScript) với các thiết lập nghiêm ngặt, đảm bảo toàn bộ mã nguồn tuân thủ kiểm tra kiểu trước khi biên dịch.
- **FR-003**: Hệ thống PHẢI thiết lập khung kiểm thử tự động (Unit Test Runner) có khả năng thực thi nhanh chóng các bài kiểm tra logic lưu trữ, phân tích tham số dòng lệnh và tiện ích hệ thống.
- **FR-004**: Hệ thống PHẢI cung cấp kịch bản biên dịch tự động (build script) có khả năng đóng gói riêng biệt cho tiến trình chính (main), tiến trình cầu nối bảo mật (preload với sandbox), và tiến trình giao diện người dùng (renderer), đồng thời sao chép chính xác tài nguyên tĩnh vào thư mục phân phối.
- **FR-005**: Kịch bản biên dịch KHÔNG ĐƯỢC bỏ qua lỗi biên dịch hoặc ẩn lỗi thông qua các lệnh chuyển hướng lỗi hệ thống.
- **FR-006**: Hệ thống PHẢI cung cấp script thực thi dòng lệnh (`bin/zaloview.js`) có khả năng tự xác định thư mục gốc của ứng dụng theo vị trí tệp launcher, thay vì dựa vào thư mục làm việc hiện tại (cwd).
- **FR-007**: Script thực thi dòng lệnh PHẢI chuyển tiếp nguyên vẹn các đối số dòng lệnh tới tiến trình ứng dụng mà không cố định cứng tham số mặc định.
- **FR-008**: Hệ thống PHẢI cung cấp tệp khởi nhập tối thiểu (`src/main/index.ts`) thực hiện phân tích các cờ dòng lệnh cơ bản (`--manager`, `--profile <id>`), báo lỗi khi cờ không hợp lệ và thiết lập nền tảng vòng đời ứng dụng.
- **FR-009**: Hệ thống PHẢI định nghĩa các lệnh chạy chuẩn hóa: biên dịch (`build`), kiểm tra kiểu (`typecheck`), chạy thử nghiệm (`test`), và chạy ứng dụng phát triển (`start`).

---

### Key Entities *(include if feature involves data)*

- **Cấu hình dự án (Project Manifest)**: Định nghĩa các gói phụ thuộc phát triển và runtime, phiên bản phần mềm, cấu hình công cụ và các script thực thi chuẩn hóa.
- **Đối số dòng lệnh (CLI Arguments)**: Dữ liệu đầu vào từ người dùng khi kích hoạt launcher, gồm chế độ hoạt động (quản lý hoặc profile cụ thể) và các cờ tùy chọn.
- **Túi phân phối mã nguồn (Build Artifacts)**: Tập hợp các tệp mã đã biên dịch và tài nguyên tĩnh được tổ chức trong thư mục đích theo đúng ranh giới bảo mật (tiến trình chính, cầu nối preload, giao diện người dùng).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Quá trình cài đặt gói phụ thuộc từ một bản clone mới (`npm ci`) và toàn bộ chuỗi xác thực (`npm run typecheck`, `npm run build`, `npm test`) hoàn tất trong dưới 2 phút với tỷ lệ đạt 100%.
- **SC-002**: Script launcher khởi động và phân giải đường dẫn ứng dụng thành công từ bất kỳ thư mục làm việc nào trên hệ thống Linux trong dưới 1 giây.
- **SC-003**: 100% các tệp mã nguồn tuân thủ kiểm tra kiểu nghiêm ngặt, không có bất kỳ cảnh báo hoặc lỗi kiểm tra kiểu nào.
- **SC-004**: Không có bất kỳ phụ thuộc nào bị cảnh báo lỗ hổng bảo mật nghiêm trọng (critical vulnerabilities) khi hoàn tất cài đặt phụ thuộc.

---

## Assumptions

- Môi trường phát triển và vận hành là hệ điều hành Linux 64-bit (chẳng hạn Fedora, Ubuntu, Arch) có cài đặt sẵn môi trường thực thi Node.js (phiên bản ổn định LTS hiện hành: Node v20+ hoặc v22+).
- Người dùng có quyền đọc/ghi trên thư mục dự án và có quyền tạo tiến trình con mà không cần quyền quản trị viên tối cao (root/sudo).
- Không sử dụng các bản phân phối runtime cũ đã hết hạn hỗ trợ bảo mật.
