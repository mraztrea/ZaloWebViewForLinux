# Review triển khai Manager Phase 5

Phạm vi: thiết kế `007-phase5-manager`, code tại `844cbbc` và bản sửa trong working tree.

## Theo dõi công việc

- [x] Đọc spec, plan, hợp đồng, mô hình dữ liệu và kiểm tra các luồng thực thi.
- [x] Review độc lập phần backend; rà UI, vòng đời và bằng chứng kiểm thử.
- [x] Tạo index GitNexus tại commit `844cbbc`; phân tích ảnh hưởng trước sửa.
- [ ] Thêm ca hồi quy tái hiện lỗi, xác nhận thất bại trước sửa.
- [ ] Sửa các lỗi xác nhận được theo thiết kế hiện có.
- [ ] Chạy typecheck, build, toàn bộ test và review lại bản sửa.
- [ ] Cập nhật bằng chứng và các bước nghiệm thu chưa thực hiện.

## Bằng chứng ban đầu

Sau `npm ci` và `npm run build`, bộ test cũ đạt **20 tệp / 166 test**.
Chưa có test hành vi renderer. Môi trường có Chrome headless, không có DISPLAY/Wayland/Xvfb.

GitNexus: repo/worktree `/home/buiducthanh/projects/canhan/ZaloWebViewForLinux`,
index tại `844cbbc8fa58a2a029b5ecc71139a7d7307473fb`.
`makeCard` và `refreshRunnerStates`: CRITICAL (5 luồng);
`storeIconBuffer`: HIGH (3 luồng); `fetchIconBuffer`: LOW.
Các kết quả UNKNOWN đã được đối chiếu caller trong source, không coi là không ảnh hưởng.
