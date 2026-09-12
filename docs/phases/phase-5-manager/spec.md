# Đặc tả phase 5 — Manager và nghiệm thu đầu cuối

Ngày đối chiếu: 12/09/2026. Trạng thái: Manager mới có giao diện khởi tạo; chưa có bridge quản lý profile. Phạm vi: Task 7–8 của [kế hoạch tổng](../../detailed_tasks_plan.md).

## Mục tiêu và phạm vi

Người dùng quản lý profile bằng GUI: thêm/sửa/xóa, tìm kiếm, mở runner, xem trạng thái, xóa cảnh báo, chọn icon, thử XPath và bật shortcut. Bàn giao được cách cài/chạy và báo cáo kết quả thực theo môi trường Linux.

Kế thừa [thiết kế chuẩn](../../design_specification.md), [ràng buộc chung](../README.md) và [API shortcut phase 4](../phase-4-shortcuts/spec.md). Dùng lại `ProfileManager`, socket runner và attention hiện có; không xây engine XPath/notification mới. Việc nhận diện đăng nhập không được suy từ `did-finish-load`; UI hướng dẫn người dùng mở đúng runner để đăng nhập khi chưa thể xác nhận.

## Yêu cầu và tiêu chí chấp nhận

| Mã | Yêu cầu | Ca nghiệm thu |
| --- | --- | --- |
| P5-01 | Manager preload riêng, bridge từng API và handler thật; kiểm tra sender/main frame/local URL và payload | Từ chối website, iframe, payload null/sai kiểu; không expose generic invoke, ipcRenderer hoặc event |
| P5-02 | Cards hiển thị icon/name/URL, runner/attention; tìm kiếm và refresh khi Manager hiển thị | Loading/empty/error phân biệt; cửa sổ ẩn không tiếp tục poll; lỗi socket là unknown khi chưa chứng minh stopped |
| P5-03 | Thêm/sửa giữ mọi trường và năm checkbox; ID/createdAt bất biến | Sửa với false giữ false; thêm sau sửa reset defaults; giữ userAgent; lỗi lưu giữ form; lưu thành công mới đóng |
| P5-04 | Save/toggle đồng bộ shortcut và trả lỗi từng phần | Registry lưu nhưng entry lỗi vẫn báo đúng và cho retry; config runner cũ hiển thị “cần mở lại” |
| P5-05 | Launch runner và mở Manager từ tray là instance độc lập | Manager đóng runner vẫn chạy; mở lặp chỉ restore; lỗi spawn hiện rõ |
| P5-06 | Thử XPath bằng profileId, selector, mode qua đúng runner/document | Profile chưa lưu/chưa mở có hướng dẫn; match/no-match/invalid-selector/invalid-data/loading/timeout hiển thị riêng; không sửa config/baseline hoặc tạo alert |
| P5-07 | Xóa profile chỉ sau khi xác nhận runner dừng; giữ session mặc định | Shutdown timeout/unknown không xóa; không coi ACK là đã dừng; tạo lại cùng tên không nhận session cũ |
| P5-08 | Xóa session là thao tác riêng có xác nhận trong app | Hiện đúng ID/phạm vi dữ liệu, kiểm tra runner dừng và đường dẫn thuộc app; hủy xác nhận không đổi dữ liệu |
| P5-09 | Chọn file hoặc tải favicon/apple-touch-icon an toàn, fallback PNG | HTTP(S), mỗi redirect được validate, tối đa 2 MiB và 1024×1024, không cookie phiên; ảnh hỏng/quá lớn/timeout/file mất đều có fallback |
| P5-10 | UI an toàn và dùng được bằng bàn phím | Tên `<img src=x onerror=alert(1)>` hiện literal; CSP asset local; label/focus/Escape đúng; theme theo hệ thống hoặc lựa chọn |
| P5-11 | Chuỗi đầu cuối đủ hành vi và có fault test | CRUD → launch/login → test XPath → alert → focus clear → shortcut → mở lặp → sửa → xóa; JSON hỏng, lỗi ghi/mạng, crash, stale socket giữ dữ liệu |
| P5-12 | Bản dev và bản phân phối được kiểm tra riêng | Checkout sạch dùng lockfile; typecheck/build/test; smoke preload/assets/launcher; báo cáo phiên bản và ma trận desktop có bằng chứng |

## Hợp đồng Manager dự kiến

Các API dưới đây chỉ expose ở Manager qua `window.zaloview`; tên namespace này là đề xuất cho phần chưa triển khai. Dùng type hiện có trong `src/shared/types.ts`, thêm hợp đồng sau khi đối chiếu schema. Mỗi lời gọi trả Promise; lỗi validation/đọc/ghi trước lưu phải là lỗi rõ ràng để UI giữ dữ liệu.

| API và đầu vào | Đầu ra/hành vi main |
| --- | --- |
| `getProfiles()` | `Profile[]` từ registry đã validate; JSON hỏng trả lỗi, không giả danh sách rỗng |
| `saveProfile({ id?, ...trườngCóThểSửa })` | `{ profile, shortcut: ShortcutSyncResult, restartRequired }`; main tạo ID/timestamps, merge trường cho phép; không tin createdAt từ renderer |
| `deleteProfile(profileId)` | Dừng/xác nhận dừng → gỡ shortcut → xóa registry; giữ session; lỗi ở bước nào báo rõ bước đó |
| `launchProfile(profileId)` | Khởi chạy bằng argument array; trả đã gửi yêu cầu mở, không khẳng định runner sẵn sàng trước status |
| `toggleShortcut(profileId, enabled)` | Lưu checkbox rồi gọi service phase 4; trả kết quả save/shortcut riêng |
| `getRunnerStatus(profileId)` | Trạng thái running/stopped/unknown; khi kết nối được kèm `RunnerStatusData`, loading/error và revision đang dùng |
| `clearAttention(profileId)` | Chuyển `clear-attention` tới socket; không reset baseline |
| `testXPath(profileId, selector, mode)` | Chuyển `test-xpath`; trả `XPathEvaluationResult` hoặc lỗi vòng đời/kết nối có phân loại |
| `chooseIcon()` | Dialog file; kiểm tra/chuẩn hóa/sao chép vào vùng icon app; hủy dialog không coi là lỗi |
| `fetchIcon(url)` | Tải có giới hạn; trả đường icon đã chuẩn hóa hoặc fallback kèm lý do |
| `deleteProfileSession(profileId)` | API riêng cho P5-08; xác nhận native do main quản lý, không chấp nhận boolean “đã xác nhận” do renderer tự gửi |

`ShortcutSyncResult` theo phase 4. `restartRequired` so revision snapshot runner với profile đã lưu; không suy chỉ từ runner có tồn tại. UI phải có trạng thái chưa xác định nếu không lấy được revision.

Trong `deleteProfile`, nếu runner chưa dừng thì giữ mọi dữ liệu. Nếu gỡ shortcut lỗi thì giữ registry và báo lỗi; nếu gỡ thành công nhưng xóa registry lỗi thì profile còn trong danh sách, thông báo shortcut đã gỡ và cho đồng bộ lại. Không có transaction nguyên tử giữa registry và `.desktop`.

Với profile đã xóa nhưng còn session, không cấp lại ID đó cho profile mới. Chỉ xóa session qua mục dữ liệu đã giữ lại hoặc hành động riêng có ID mục tiêu cụ thể; không cần hiển thị cookie/nội dung phiên.

Icon dùng main `fetch` và decode PNG bằng công cụ Electron hiện có; chốt timeout tổng 5000 ms và tối đa 5 redirect cho phần mới, kiểm tra cả byte thực tế khi đọc stream. Không chuyển cookie/Authorization website, không chèn SVG mạng inline. URL mạng nội bộ người dùng chủ động cấu hình vẫn được phép theo thiết kế chuẩn.

## Điều kiện hoàn thành và ma trận

- [ ] P5-01…P5-12 có task và bằng chứng; xử lý R03–R06 ở [hướng dẫn sửa](../../code_remediation_guide.md) trước nghiệm thu phần phụ thuộc.
- [ ] Bản phân phối dùng được theo `docs/installation.md` dự kiến của phase 4; báo cáo thực ghi tại `docs/verification.md` khi triển khai, không điền PASS dự đoán.

| Môi trường | Web/session/quyền | XPath/alert/focus | Badge/tray | Menu/pin | Trạng thái lần biên soạn |
| --- | --- | --- | --- | --- | --- |
| KDE Plasma / X11 | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa chạy desktop |
| KDE Plasma / Wayland | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Bằng chứng cũ lỗi kết nối display, không chứng minh tương thích |
| GNOME / X11 nếu có | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa chạy desktop |
| GNOME / Wayland | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa kiểm thử | Chưa chạy desktop |

Mỗi kết quả cần distro/desktop/version, Electron/Chromium, backend, extension tray/dock, notification service, DND và giới hạn. “Không hỗ trợ” cần bằng chứng; thiếu môi trường chỉ là “Chưa kiểm thử”.
