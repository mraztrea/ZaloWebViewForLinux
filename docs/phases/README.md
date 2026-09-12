# Bộ đặc tả và kế hoạch phase 4–5

Ngày đối chiếu: 12/09/2026. Mốc mã nguồn: `27a7681`, nhánh `develop`.

Bộ này triển khai chi tiết phase 4–5 của [lộ trình](../phased_implementation_plan.md), kế thừa [thiết kế chuẩn](../design_specification.md) và [8 task](../detailed_tasks_plan.md). Theo yêu cầu cập nhật, không tạo hoặc cập nhật tài liệu riêng cho phase 1–3. Đây là tài liệu chuẩn bị thực hiện; checkbox chưa đánh dấu là việc cần kiểm tra/hoàn thiện. Lần cập nhật này chỉ sửa tài liệu trong `docs/`.

## Danh mục và hiện trạng

| Phase | Đặc tả | Kế hoạch | Task gốc | Hiện trạng đối chiếu |
| --- | --- | --- | --- | --- |
| 4 — Shortcut | [spec.md](phase-4-shortcuts/spec.md) | [plan.md](phase-4-shortcuts/plan.md) | 6 | Có desktop fixture; chưa có `desktop-service.ts` |
| 5 — Manager và nghiệm thu | [spec.md](phase-5-manager/spec.md) | [plan.md](phase-5-manager/plan.md) | 7–8 | Manager mới có khung giao diện; chưa có bridge CRUD và icon service |

Các hợp đồng nền tảng trong `specs/001-project-init` đến `specs/004-desktop-attention-tray` chỉ được tham chiếu như đầu vào. Không tạo feature Spec-Kit mới và không thay `.specify/feature.json` trong lần biên soạn này.

## Quy tắc áp dụng chung cho mọi spec và plan

- Node.js `>= 22.0.0`, Electron `>= 44.3.0`; dùng lockfile, TypeScript strict, esbuild và Vitest hiện có. Lockfile tại mốc đối chiếu ghi Electron `44.3.0`, Vitest `3.2.7`; đây không phải kết luận về phiên bản stable mới nhất.
- Tái sử dụng module hiện có; chỉ tạo file được ghi là “dự kiến tạo”. Mọi chỉ dẫn sửa code trong plan chỉ áp dụng khi có yêu cầu triển khai sau này.
- Main/runner dùng `BrowserWindow.loadURL`, mỗi profile có process, `userData`, `sessionData`, partition và lock riêng. Cửa sổ sandbox, context isolation, không Node trong renderer; không tắt CSP/chứng chỉ/webSecurity.
- Dữ liệu cấu hình theo thiết kế chuẩn: schema 1; ID bất biến tối đa 64 ký tự; tên tối đa 120; URL HTTP(S) không credentials; XPath interval nguyên 1000–60000 ms, mặc định 3000; debounce 300 ms; popup cooldown 2000 ms; preview tối đa 500 ký tự.
- Registry chỉ Manager ghi; runner chỉ ghi dữ liệu riêng. Tôn trọng XDG tuyệt đối/fallback; file riêng tư `0600`, thư mục riêng `0700`, desktop entry `0644`. Thử bằng thư mục XDG tạm, không dùng cấu hình/tài khoản thật ngoài phạm vi thử được chọn.
- Socket JSON theo dòng, request ID, tối đa 64 KiB; chỉ một test XPath đang chờ. Duy trì `status`, `shutdown`, `test-xpath`, `clear-attention`; không thêm thực thi lệnh/JavaScript tùy ý.
- Trước lần sửa code sau này: cập nhật chỉ mục GitNexus, chạy impact upstream cho symbol bị sửa, báo callers/processes/risk; `UNKNOWN` cần đối chiếu thêm. Trước commit chạy detect_changes đầy đủ. Không coi graph hiện tại chậm 4 commit là bằng chứng an toàn.
- Mỗi đầu việc: viết ca hồi quy cụ thể → chạy xác nhận bắt được thiếu sót → sửa tối thiểu → chạy lại ca đó; cuối phase chạy `npm run typecheck`, `npm test`, `npm run build`. Không bắt tạo lại test đã bao phủ đúng yêu cầu.
- Chỉ chuyển phase khi gate trước đạt trên môi trường phát triển được ghi rõ. Khả năng desktop không hỗ trợ phải có giới hạn/fallback; chưa có môi trường để đo thì ghi “Chưa kiểm thử”, không đổi thành “Không hỗ trợ”.

## Cách ghi bằng chứng và xử lý vấn đề

[Hướng dẫn sửa code](../code_remediation_guide.md) ghi vấn đề thấy trong code ảnh hưởng phase 4–5, phần tính năng còn thiếu và các kiểm chứng chưa thực hiện. Các mã `R01`… được dùng để truy vết trong plan. Không có sửa chữa code nào được thực hiện trong lần này.

Khi nghiệm thu, mỗi ca ghi: mã yêu cầu, commit, lệnh/thao tác, kết quả mong đợi, kết quả thực tế, đường dẫn log/ảnh đã loại bỏ dữ liệu nhạy cảm, phiên bản Electron/Chromium, distro, desktop, X11/Wayland, tray/dock extension và DND. Dùng bốn trạng thái: Đạt / Không đạt / Không hỗ trợ có bằng chứng / Chưa kiểm thử.

Kết quả kiểm tra tự động của lần biên soạn được ghi trong hướng dẫn sửa code. Các kết quả desktop cũ tại [quickstart phase notification](../../specs/004-desktop-attention-tray/quickstart.md) có lỗi kết nối `wayland-0`; không phải bằng chứng ứng dụng đã đạt trên KDE Wayland.
