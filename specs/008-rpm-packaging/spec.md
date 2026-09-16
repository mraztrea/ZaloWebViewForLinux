# Đặc tả tính năng: Đóng gói RPM cài đặt hệ thống cho Fedora

**Nhánh tính năng**: `008-rpm-packaging`

**Ngày tạo**: 2026-09-15

**Trạng thái**: Nháp

**Đầu vào**: Yêu cầu người dùng: "Có thể build thành 1 file cài đặt dạng .rpm được không?" và lựa chọn triển khai bằng `rpmbuild` thuần (không thêm dependency).

**Nguồn nghiệp vụ**: `docs/build-fedora.md`, `docs/installation.md` (bundle cấp người dùng), `specs/001-project-init/contracts/build-pipeline.md`.

## Bối cảnh

Hiện tại `npm run package:linux` tạo một thư mục bundle tự chứa tại `build/zaloview-linux-<arch>/`. Người dùng muốn một **file cài đặt duy nhất** dạng `.rpm` để cài toàn hệ thống bằng `dnf` trên Fedora.

Khác biệt cốt lõi so với bundle cấp người dùng: RPM cài vào các đường hệ thống (`/usr/...`) cần `sudo`, trong khi `resolveLauncherPath()` đang trỏ cứng tới `$HOME/.local/opt/zaloview/zaloview`. Nếu không xử lý, shortcut `.desktop` do Manager sinh ra sẽ trỏ tới đường không tồn tại trên máy cài bằng RPM.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tạo một file .rpm từ mã nguồn (Priority: P1)

Người phát triển chạy một lệnh để sinh ra duy nhất một file `.rpm` chứa toàn bộ Electron runtime và ứng dụng đã build, không cần cài thêm công cụ ngoài gói `rpm-build` có sẵn trên Fedora.

**Why this priority**: Đây là giá trị cốt lõi của tính năng. Không có file `.rpm` thì mọi thứ khác vô nghĩa.

**Independent Test**: Chạy `npm run package:rpm`, xác nhận sinh ra đúng một file `.rpm` và `rpm -qip`/`rpm -qlp` đọc được metadata cùng danh sách file.

**Acceptance Scenarios**:

1. **Given** checkout đã `npm install`, **When** chạy `npm run package:rpm`, **Then** sinh ra `build/zaloview-<version>-1.<arch>.rpm`.
2. **Given** RPM đã sinh, **When** kiểm tra bằng `rpm -qip`, **Then** tên, phiên bản, giấy phép và kiến trúc khớp `package.json`.
3. **Given** bundle cấp người dùng đã tồn tại, **When** đóng gói RPM, **Then** script tái sử dụng bundle thay vì dựng lại logic đóng gói.

### User Story 2 - Cài và chạy đúng trên Fedora (Priority: P1)

Người dùng cài file `.rpm` bằng `dnf`, sau đó mở Manager từ menu hoặc dòng lệnh và tạo shortcut profile hoạt động đúng.

**Why this priority**: Một installer cài được nhưng shortcut trỏ sai là lỗi chức năng nghiêm trọng.

**Independent Test**: Cài RPM trong môi trường thử, chạy `zaloview --manager` và `zaloview --version`, xác nhận launcher được phân giải đúng khi ứng dụng ở chế độ packaged.

**Acceptance Scenarios**:

1. **Given** RPM đã cài, **When** chạy `zaloview --version` từ `/tmp`, **Then** in ra `zaloview v<version>` và không phụ thuộc `PATH`/Node/npm.
2. **Given** ứng dụng chạy ở chế độ packaged (`app.isPackaged`), **When** Manager phân giải đường launcher mặc định, **Then** trả về đường dẫn thực của binary đang chạy thay vì `$HOME/.local/opt/...`.
3. **Given** ứng dụng chạy dev từ source, **When** phân giải đường launcher mặc định, **Then** giữ nguyên hành vi cũ `$HOME/.local/opt/zaloview/zaloview`.
4. **Given** RPM đã cài, **When** xem menu ứng dụng, **Then** có entry Manager mở đúng binary.

### User Story 3 - Gỡ cài đặt sạch (Priority: P2)

Người dùng gỡ RPM và không còn file nào của ứng dụng trong các đường hệ thống.

**Independent Test**: `sudo dnf remove zaloview`, sau đó xác nhận `/usr/lib/zaloview` và `/usr/bin/zaloview` đã biến mất.

## Requirements *(mandatory)*

- **FR-001**: Thêm npm script `package:rpm` chạy `scripts/package-rpm.mjs`.
- **FR-002**: Script sinh đúng một file `build/zaloview-<version>-1.<arch>.rpm`; ánh xạ `x64 → x86_64`, `arm64 → aarch64`, các kiến trúc khác báo lỗi rõ ràng.
- **FR-003**: Script tái sử dụng bundle từ `scripts/package-linux.mjs` (spawn script này) thay vì lặp lại logic.
- **FR-004**: RPM cài bundle vào `/usr/lib/zaloview/` và tạo symlink `/usr/bin/zaloview`.
- **FR-005**: RPM cài entry menu `/usr/share/applications/zaloview-manager.desktop` dùng icon dự phòng `applications-internet` (asset icon hiện tại là placeholder 1×1 nên không cài làm icon hệ thống).
- **FR-006**: `resolveLauncherPath()` phải trả đường dẫn launcher đúng theo chế độ chạy: packaged dùng đường thực của `process.execPath`; dev giữ mặc định `$HOME/.local/opt/zaloview/zaloview`.
- **FR-007**: Không thêm dependency npm mới; chỉ dùng `rpmbuild` có sẵn trong `rpm-build`.
- **FR-008**: `%install` không dùng đường tuyệt đối ngoài `%{buildroot}`; build tái lập được từ output bundle.
- **FR-009**: `chrome-sandbox` trong bundle phải có mode setuid 4755 root:root để sandbox hoạt động khi user namespace bị hạn chế.

## Success Criteria *(mandatory)*

- **SC-001**: `npm run package:rpm` thành công, sinh ra một file `.rpm` hợp lệ mở được bằng `rpm -qip`.
- **SC-002**: `rpm -qlp` liệt kê đủ bundle, symlink và entry menu, không chứa `node_modules`/source.
- **SC-003**: `npm run typecheck` và `npm test` sạch sau thay đổi.
- **SC-004**: Smoke test packaged launcher (`--version`) đạt từ thư mục tạm.

## Assumptions

- Tên package RPM: `zaloview`; tên hiển thị: `ZaloWebView`.
- Giấy phép lấy từ `package.json` (`MIT`).
- RPM chỉ hỗ trợ cài hệ thống; bundle cấp người dùng tiếp tục là đường mặc định cho bản portable.
