# Tài Liệu Dự Án: Linux Webview Manager (Zalo & Custom Web Apps)

Thư mục này chứa toàn bộ các tài liệu đặc tả thiết kế và kế hoạch triển khai của dự án:

---

## 📑 Danh Sách Tài Liệu

### 1. [Lộ Trình Triển Khai 5 Phase (Phased Implementation Plan)](file:///home/buiducthanh/projects/canhan/ZaloWebView/docs/phased_implementation_plan.md)
* **File:** `docs/phased_implementation_plan.md`
* **Mục đích:** Kế hoạch hành động chia toàn bộ dự án thành **5 Phase nhỏ lũy tiến**. Mỗi phase đều có phạm vi rõ ràng, deliverable chạy được độc lập và tiêu chí nghiệm thu chi tiết:
  * **Phase 1:** Core Webview Runner & Session Isolation (MVP - mở app độc lập, cookie tách biệt, WebRTC).
  * **Phase 2:** XPath Observer Engine & Deduplication (DOM inspection, trích xuất unread badge/text, chống spam).
  * **Phase 3:** Linux Desktop Integration & Attention Reset (Sáng taskbar, dock badge, khay hệ thống tray, tự tắt alert khi focus).
  * **Phase 4:** Start Menu Integration (.desktop Generator, `StartupWMClass`, cập nhật menu KDE/GNOME).
  * **Phase 5:** Manager Dashboard GUI (Giao diện quản lý profile đồ họa, test XPath trực tiếp).

### 2. [Đặc Tả Thiết Kế Kỹ Thuật (Design Specification)](file:///home/buiducthanh/projects/canhan/ZaloWebView/docs/design_specification.md)
* **File:** `docs/design_specification.md`
* **Mục đích:** Tài liệu kiến trúc hoàn chỉnh, phân tích sâu về:
  * Kiến trúc Electron Multi-Instance Runner + Manager GUI.
  * Cấu trúc lưu trữ dữ liệu XDG `~/.config/zaloview/` và phân vùng session `persist:zaloview_<id>`.
  * Thuật toán kết hợp MutationObserver + Polling và xử lý Cooldown.
  * Tích hợp sâu Linux: `window.flashFrame`, `app.setBadgeCount`, FreeDesktop DBus Notifications.
  * Tích hợp Start Menu với `StartupWMClass` để Dock tách biệt icon riêng.

### 3. [Kế Hoạch Chi Tiết 8 Tasks Kỹ Thuật (Detailed Tasks Plan)](file:///home/buiducthanh/projects/canhan/ZaloWebView/docs/detailed_tasks_plan.md)
* **File:** `docs/detailed_tasks_plan.md`
* **Mục đích:** Bảng phân rã kỹ thuật chi tiết theo chuẩn Test-Driven Development (TDD): danh sách file, định nghĩa interface, code mẫu và các bước test tự động cho từng module.

### 4. [Yêu Cầu Ban Đầu (Original Prompt)](file:///home/buiducthanh/projects/canhan/ZaloWebView/docs/org_prompt.md)
* **File:** `docs/org_prompt.md`
* **Mục đích:** Bản ghi yêu cầu và ý tưởng ban đầu từ người dùng.
