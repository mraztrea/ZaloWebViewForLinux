# Linux Webview Manager — Tài liệu dự án

Ngày rà soát: 12/09/2026. Repo đã có mã nguồn, cấu hình build và bộ test; Manager hiện mới là khung giao diện và chưa có service sinh shortcut. Đợt cập nhật này chỉ bổ sung tài liệu phase 4–5, không tạo/cập nhật tài liệu riêng phase 1–3. Các checkbox trong kế hoạch là việc cần hoàn thiện hoặc kiểm chứng, không phải kết quả nghiệm thu runtime.

## Tài liệu chuẩn

| Tài liệu | Vai trò |
| --- | --- |
| [Yêu cầu ban đầu](org_prompt.md) | Bản ghi nguyên gốc, giữ nguyên để truy vết yêu cầu. |
| [Đặc tả thiết kế](design_specification.md) | Phạm vi, kiến trúc, dữ liệu, bảo mật và hành vi chuẩn. |
| [Lộ trình 5 phase](phased_implementation_plan.md) | Thứ tự triển khai và điều kiện nghiệm thu từng giai đoạn. |
| [Kế hoạch chi tiết 8 task](detailed_tasks_plan.md) | Đầu việc, phụ thuộc, hợp đồng và kiểm tra cho từng module. |
| [Spec và plan phase 4–5](phases/README.md) | Đặc tả, API, đầu việc, file liên quan và tiêu chí nghiệm thu shortcut/Manager. |
| [Hướng dẫn xử lý code](code_remediation_guide.md) | Bằng chứng các điểm cần xử lý khi triển khai phase 4–5 và ca hồi quy; chưa sửa code. |

Đọc theo thứ tự trên. Khi có mâu thuẫn, đối chiếu yêu cầu gốc rồi sửa đặc tả và các kế hoạch liên quan cùng lúc. Những đường dẫn cũ trong `superpowers/` chuyển tới tài liệu chuẩn, không duy trì thêm bản sao.

## Những vấn đề đã chỉnh trong thiết kế ở lần rà soát trước

Các mục dưới đây mô tả việc sửa tài liệu thiết kế, không khẳng định mã nguồn đã đáp ứng đầy đủ. Hiện trạng và các điểm còn thiếu được ghi riêng trong hướng dẫn xử lý code ở trên.

- Khóa instance: dữ liệu bổ sung của `requestSingleInstanceLock` không tạo khóa theo profile; quy định `userData` riêng trước khi lấy khóa và khởi chạy runner riêng từ Manager.
- Định danh Linux: bỏ thuộc tính `wmClass` không thuộc hợp đồng `BrowserWindow`; phân biệt X11 `WM_CLASS`, Wayland app ID và tên file `.desktop`, thêm bước kiểm chứng trên runtime đã chọn.
- Thông báo: tách trạng thái DOM khỏi cảnh báo đã xem; cập nhật cả khi count giảm, cooldown chỉ giới hạn popup, focus không xóa baseline làm tin cũ báo lại.
- Build và UI: yêu cầu bundle preload cho sandbox, build renderer cho trình duyệt, xử lý đủ bridge/test XPath và khôi phục đầy đủ trường khi sửa profile.
- An toàn: kiểm tra IPC sender, quyền theo origin, URL và ID; ghi cấu hình nguyên tử, tránh nhiều tiến trình ghi đè và không coi JSON lỗi là danh sách rỗng.
- Shortcut: dùng launcher thực tế, escape đúng Desktop Entry, bỏ `%u` và action chưa có CLI; không coi `update-desktop-database` là cơ chế ép menu refresh.
- Nghiệm thu: bỏ cam kết tương thích tuyệt đối, bổ sung khác biệt KDE/GNOME và X11/Wayland, đường khôi phục cửa sổ khi tray không hiển thị.
- Liên kết: thay đường dẫn `file:///home/...` bằng liên kết tương đối; thay hai bản sao bằng trang dẫn tới bản chuẩn.

Nguồn kỹ thuật được dẫn ngay trong [đặc tả](design_specification.md). Các đoạn mã triển khai dài của bản cũ đã được thay bằng yêu cầu và ca kiểm tra; có thể truy lại bản cũ qua Git.
